import os
import tempfile
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

from rag_chatbot import (
    ChromaDBManager,
    ingest_document,
    generate_answer_llama,
    generate_simple_answer,
    clear_session,
    TOP_K,
)

app = FastAPI(title="RAG Chatbot API")

# Enable CORS so the React app on 5173 can call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize ChromaDB manager and verify collection
chroma_manager = ChromaDBManager()
chroma_manager.create_collection()

class QueryRequest(BaseModel):
    question: str
    api_key: Optional[str] = None
    selected_docs: Optional[List[str]] = None

class DeleteDocRequest(BaseModel):
    doc_name: str

@app.post("/api/ingest")
async def api_ingest(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".txt", ".md", ".pdf"):
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .txt, .md, or .pdf")

    try:
        # Save upload to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name

        try:
            # Chunks are appended to the collection to support multiple documents
            ingest_document(temp_path, chroma_manager, doc_name=file.filename)
            info = chroma_manager.get_collection_info()
            chunk_count = info["count"] if info else 0

            return {
                "success": True,
                "doc_name": file.filename,
                "chunks": chunk_count
            }
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/query")
async def api_query(request: QueryRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty")

    try:
        # Perform query search filtering by selected_docs if provided
        top_chunks = chroma_manager.search(request.question, TOP_K, selected_docs=request.selected_docs)
        if not top_chunks:
            return {
                "answer": "No relevant context chunks found in the selected documents. Please verify that documents are selected.",
                "sources": []
            }

        # Answering decision
        if request.api_key:
            answer = generate_answer_llama(request.question, top_chunks, api_key=request.api_key)
        else:
            answer = generate_simple_answer(request.question, top_chunks)

        return {
            "answer": answer,
            "sources": [
                {
                    "index": chunk["index"] + 1,
                    "text": chunk["text"],
                    "score": float(chunk.get("score", 0)),
                    "doc_name": chunk.get("doc_name", "unknown")
                }
                for chunk in top_chunks
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/delete_document")
async def api_delete_document(request: DeleteDocRequest):
    try:
        success = chroma_manager.delete_document(request.doc_name)
        if not success:
            raise HTTPException(status_code=500, detail=f"Failed to delete document: {request.doc_name}")
        return {"success": True, "message": f"Document '{request.doc_name}' deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clear")
async def api_clear():
    try:
        chroma_manager.delete_collection()
        chroma_manager.create_collection()
        clear_session()
        return {"success": True, "message": "Database and active sessions cleared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/info")
async def api_info():
    try:
        info = chroma_manager.get_collection_info()
        docs = chroma_manager.get_unique_documents()
        return {
            "collection": info["name"] if info else None,
            "chunks": info["count"] if info else 0,
            "documents": docs,
            "embedding_model": info["embedding_function"] if info else None
        }
    except Exception as e:
        return {"collection": None, "chunks": 0, "documents": [], "embedding_model": None, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
