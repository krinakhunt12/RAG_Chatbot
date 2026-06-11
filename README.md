# Local RAG Document Assistant

A high-performance, local Retrieval-Augmented Generation (RAG) document question-answering assistant. The application splits, indexes, and queries `.txt`, `.md`, and `.pdf` files locally using ChromaDB and SentenceTransformers, with text generation performed by Llama-3.1 (via Hugging Face router) or an offline semantic fallback.

---

## 🏗️ Project Architecture

```
RAG/
├── Backend/                 # Python FastAPI backend
│   ├── api.py               # REST API endpoints (Ingestion, Query, Info)
│   ├── rag_chatbot.py       # Core RAG implementation (ChromaDB & embeddings)
│   ├── requirements.txt     # Backend python dependencies
│   └── venv/                # Python virtual environment
├── Frontend/                # React Vite frontend
│   ├── src/
│   │   ├── App.tsx          # Premium Chat UI & Sidebar controls
│   │   ├── index.css        # Global Tailwind classes & custom styles
│   │   └── main.tsx         # App entrypoint
│   ├── index.html           # HTML skeleton (Google Fonts configuration)
│   ├── package.json         # Node.js dependencies & scripts
│   └── vite.config.ts       # Vite & Tailwind configuration
├── docs/                    # Sample documents (Apple, Microsoft, Nvidia)
└── README.md                # Project documentation
```

---

## ⚡ Key Features

* **High-Fidelity Dark UI**: A responsive, premium dark theme built with React and Tailwind CSS.
* **Confidential Uploads**: Documents are loaded via temporary storage and deleted immediately after vector indexing. No raw documents remain saved on the disk.
* **Dynamic API Key Config**: Users can paste their Hugging Face API Key dynamically in the sidebar to utilize their personal quota for Llama text generation.
* **Local Fallback Mode**: If no API key is provided, the system falls back to an offline semantic overlap sentence matching extractor.
* **RAG Reference Drawer**: Under every answer, users can expand a details card to inspect the exact text chunks matched in the vector store along with their similarity scores.

---

## 🚀 Getting Started

### 📋 Prerequisites
* **Python**: 3.10 or higher
* **Node.js**: 18.0 or higher

---

### 📥 Step 1: Run the Backend server

1. Open your terminal and navigate to the `Backend` directory:
   ```powershell
   cd Backend
   ```
2. Activate the virtual environment:
   ```powershell
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the `Backend` directory (optional):
   ```env
   HF_API_KEY=your_huggingface_api_token_here
   ```
5. Start the FastAPI server:
   ```powershell
   python api.py
   ```
   *The server will start on `http://localhost:8000`.*

---

### 💻 Step 2: Run the Frontend application

1. Open a new terminal and navigate to the `Frontend` directory:
   ```powershell
   cd Frontend
   ```
2. Install npm packages:
   ```powershell
   npm install
   ```
3. Launch the Vite development server:
   ```powershell
   npm run dev
   ```
4. Open the local URL in your browser:
   * **`http://localhost:5173`**

---

## 🛠️ Technology Stack
* **Frontend**: React, TypeScript, Vite, Tailwind CSS, Google Fonts (Outfit & Inter)
* **Backend**: FastAPI, Uvicorn, Python
* **Vector Store**: ChromaDB
* **Embeddings**: SentenceTransformers (`all-MiniLM-L6-v2` - 384-dimensional vectors)
* **LLM Generation**: OpenAI client calling Hugging Face Router API (`meta-llama/Llama-3.1-8B-Instruct`)
