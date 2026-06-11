import os
from pathlib import Path
import streamlit as st

from rag_chatbot import (
    ChromaDBManager,
    ingest_document,
    generate_answer_llama,
    generate_simple_answer,
    TOP_K,
    HF_API_KEY,
    _hf_client,
    clear_session,
)


st.set_page_config(page_title="RAG Document Assistant", layout="wide")


def get_chroma_manager():
    if "chroma_manager" not in st.session_state:
        mgr = ChromaDBManager()
        mgr.create_collection()
        st.session_state.chroma_manager = mgr
    return st.session_state.chroma_manager


def main():
    # Configuration & Utilities (defined at the beginning to avoid UnboundLocalError)
    st.sidebar.title("Configuration")
    hf_api_key_input = st.sidebar.text_input(
        "Hugging Face API Key",
        type="password",
        help="Provide your Hugging Face API key to use Llama generation under your quota. If left blank, it falls back to the .env key or local extraction."
    )

    st.sidebar.markdown("---")
    st.sidebar.title("Utilities")
    if st.sidebar.button("Clear collection and session"):
        mgr = get_chroma_manager()
        mgr.delete_collection()
        mgr.create_collection()
        clear_session()
        st.sidebar.success("Cleared collection and session file.")

    st.title("RAG Document Assistant — Upload & Ask")

    st.markdown("Upload a `.txt`, `.md`, or `.pdf` document. The app will index it and answer questions based on the content.")

    chroma_manager = get_chroma_manager()

    cols = st.columns([2, 1])
    with cols[0]:
        uploaded = st.file_uploader("Upload document", type=["txt", "md", "pdf"])
    with cols[1]:
        replace = st.checkbox("Replace existing collection", value=True)

    if uploaded:
        import tempfile
        suffix = Path(uploaded.name).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(uploaded.getbuffer())
            temp_path = temp_file.name

        try:
            if replace:
                chroma_manager.delete_collection()
                chroma_manager.create_collection()
                clear_session()

            with st.spinner("Ingesting document and indexing... this may take a moment"):
                session = ingest_document(temp_path, chroma_manager, doc_name=uploaded.name)
            st.success(f"Document indexed: {uploaded.name}")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    # Question UI
    st.subheader("Ask a question")
    question = st.text_input("Enter your question about the loaded document")
    if st.button("Get Answer") and question:
        with st.spinner("Searching and generating answer..."):
            top_chunks = chroma_manager.search(question, TOP_K)

            if not top_chunks:
                st.info("No relevant chunks found in the indexed document.")
            else:
                user_key = hf_api_key_input.strip() if hf_api_key_input else None
                active_key = user_key or HF_API_KEY
                
                if active_key:
                    answer = generate_answer_llama(question, top_chunks, api_key=active_key)
                else:
                    answer = generate_simple_answer(question, top_chunks)

                st.markdown("**Answer:**")
                st.write(answer)

                ids = [str(c["index"] + 1) for c in top_chunks]
                st.caption(f"Sources: chunks {', '.join(ids)}")

                with st.expander("View retrieved chunks"):
                    for i, ch in enumerate(top_chunks, start=1):
                        st.write(f"Chunk {ch['index']+1} — score: {ch.get('score', 0):.3f}")
                        st.write(ch["text"][:2000])


if __name__ == "__main__":
    main()
