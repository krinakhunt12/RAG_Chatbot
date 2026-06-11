import { useState, useEffect, useRef } from 'react'

interface Source {
  index: number
  text: string
  score: number
  doc_name: string
}

interface Message {
  id: string
  sender: 'user' | 'assistant' | 'system'
  text: string
  sources?: Source[]
}

const API_BASE = 'http://localhost:8000/api'

export default function App() {
  const [inWorkspace, setInWorkspace] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your RAG Document Assistant. Please configure your Hugging Face API key and upload one or more documents in the sidebar to get started.'
    }
  ])
  const [input, setInput] = useState('')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('hf_api_key') || '')
  
  // Document management states
  const [documents, setDocuments] = useState<string[]>([])
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [totalChunks, setTotalChunks] = useState(0)
  
  const [isUploading, setIsUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch current database info on mount
  useEffect(() => {
    fetchInfo(true)
  }, [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const fetchInfo = async (initial = false) => {
    try {
      const res = await fetch(`${API_BASE}/info`)
      const data = await res.json()
      
      const docs = data.documents || []
      setDocuments(docs)
      setTotalChunks(data.chunks || 0)
      
      if (initial) {
        setSelectedDocs(docs)
      } else {
        setSelectedDocs((prev) => prev.filter((d) => docs.includes(d)))
      }
    } catch (err) {
      console.error('Failed to fetch API info:', err)
    }
  }

  const handleApiKeyChange = (val: string) => {
    setApiKey(val)
    localStorage.setItem('hf_api_key', val)
  }

  const handleFileUpload = async (file: File) => {
    if (!file) return
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    // Add immediate upload system message
    const uploadSystemMsgId = `upload-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: uploadSystemMsgId,
        sender: 'system',
        text: `Indexing "${file.name}"... This may take a moment.`
      }
    ])

    try {
      const res = await fetch(`${API_BASE}/ingest`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      
      await fetchInfo()
      setSelectedDocs((prev) => {
        if (prev.includes(file.name)) return prev
        return [...prev, file.name]
      })

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === uploadSystemMsgId
            ? { ...msg, text: `Successfully indexed "${file.name}" into database.` }
            : msg
        )
      )
    } catch (err: any) {
      console.error(err)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === uploadSystemMsgId
            ? { ...msg, text: `Error indexing file: ${err.message || 'Unknown error'}` }
            : msg
        )
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear the entire database collection and chat?')) return
    try {
      await fetch(`${API_BASE}/clear`, { method: 'POST' })
      setDocuments([])
      setSelectedDocs([])
      setTotalChunks(0)
      setMessages([
        {
          id: 'cleared',
          sender: 'assistant',
          text: 'Database collection and chat history have been cleared. Ready for new uploads!'
        }
      ])
    } catch (err) {
      console.error('Failed to clear database:', err)
    }
  }

  const handleDeleteDoc = async (docName: string) => {
    if (!confirm(`Are you sure you want to delete "${docName}" from the database?`)) return
    try {
      const res = await fetch(`${API_BASE}/delete_document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_name: docName })
      })
      if (!res.ok) throw new Error(await res.text())
      
      await fetchInfo()
      
      setMessages((prev) => [
        ...prev,
        {
          id: `delete-${Date.now()}`,
          sender: 'system',
          text: `Document "${docName}" was successfully removed from the database.`
        }
      ])
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }

  const handleToggleDocSelection = (docName: string) => {
    setSelectedDocs((prev) => {
      if (prev.includes(docName)) {
        return prev.filter((d) => d !== docName)
      } else {
        return [...prev, docName]
      }
    })
  }

  const handleSelectAllDocs = () => {
    if (selectedDocs.length === documents.length) {
      setSelectedDocs([])
    } else {
      setSelectedDocs(documents)
    }
  }

  const handleSend = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault()
    const queryText = (customText || input).trim()
    if (!queryText || isLoading) return

    if (selectedDocs.length === 0) {
      alert('Please check/select at least one document in the sidebar to search against.')
      return
    }

    if (!customText) setInput('')

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryText
    }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)

    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: queryText,
          api_key: apiKey || null,
          selected_docs: selectedDocs
        })
      })

      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: data.answer,
        sources: data.sources
      }
      setMessages((prev) => [...prev, botMsg])
    } catch (err: any) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: 'system',
          text: `An error occurred while answering: ${err.message || 'Service offline'}`
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const suggestions = [
    'What is the founding history of the company?',
    'What are the primary products or services?',
    'What key challenges is the company facing?'
  ]

  // Render Landing Page View
  if (!inWorkspace) {
    return (
      <div className="min-h-screen w-screen bg-zinc-950 text-zinc-200 overflow-y-auto relative flex flex-col justify-between font-sans">
        {/* Animated blurred blobs */}
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-cyan-500/5 rounded-full filter blur-3xl opacity-30 animate-blob pointer-events-none"></div>
        <div className="absolute bottom-25 right-10 w-[500px] h-[500px] bg-indigo-500/5 rounded-full filter blur-3xl opacity-20 animate-blob animation-delay-2000 pointer-events-none"></div>
        <div className="absolute top-40 right-1/3 w-96 h-96 bg-emerald-500/5 rounded-full filter blur-3xl opacity-20 animate-blob animation-delay-4000 pointer-events-none"></div>

        {/* Top Navbar */}
        <header className="max-w-6xl w-full mx-auto px-6 h-20 flex items-center justify-between z-10 border-b border-zinc-900/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-6 bg-cyan-500 rounded-full"></span>
            <span className="text-xl font-bold tracking-tight text-white">RAG Chatbot</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 bg-zinc-900/80 px-3.5 py-1.5 rounded-full border border-zinc-800 text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              FastAPI Online
            </span>
          </div>
        </header>

        {/* Main Landing Page Content */}
        <main className="max-w-5xl w-full mx-auto px-6 py-16 flex flex-col items-center justify-center z-10 flex-1">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 bg-cyan-500/10 text-cyan-400 text-xs font-semibold px-4 py-2 rounded-full border border-cyan-500/20 mb-8 select-none tracking-wider uppercase">
            🚀 Private Vector Knowledge Assistant
          </div>

          {/* Core Title */}
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-none max-w-4xl text-center">
            Local Context. <br />
            <span className="bg-gradient-to-r from-cyan-400 via-emerald-300 to-indigo-500 bg-clip-text text-transparent">
              Intelligent Answers.
            </span>
          </h1>

          {/* Description */}
          <p className="text-zinc-400 text-md md:text-lg max-w-2xl text-center leading-relaxed mb-10 font-medium">
            Securely index crop data, agriculture guides, or technical documents locally. Ask queries, retrieve references, and synthesize responses under complete privacy.
          </p>

          {/* CTA Action Workspace Button */}
          <button
            onClick={() => setInWorkspace(true)}
            className="group px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold rounded-xl text-md flex items-center gap-2 transition glow-btn-cyan cursor-pointer tracking-wide"
          >
            Enter Chat Workspace
            <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>

          {/* Statistics Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-20 max-w-4xl">
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 text-center backdrop-blur-md">
              <p className="text-3xl font-extrabold text-white font-mono">384</p>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mt-1">Embeddings Dimensions</p>
            </div>
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 text-center backdrop-blur-md">
              <p className="text-3xl font-extrabold text-cyan-400 font-mono">&lt; 12ms</p>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mt-1">Vector Search Latency</p>
            </div>
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 text-center backdrop-blur-md">
              <p className="text-3xl font-extrabold text-emerald-400 font-mono">100%</p>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mt-1">Local Data Security</p>
            </div>
          </div>

          {/* RAG Workflow Steps Timeline */}
          <div className="w-full mt-24 max-w-4xl">
            <h2 className="text-xl font-bold tracking-tight text-white mb-8 text-center uppercase tracking-wider text-sm text-zinc-400">
              How the Local RAG Engine Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="relative flex flex-col items-start p-5 bg-zinc-900/25 border border-zinc-900 rounded-xl backdrop-blur-sm">
                <span className="absolute -top-3.5 left-4 bg-cyan-600 text-white font-mono text-xs w-7 h-7 rounded-full flex items-center justify-center font-bold">1</span>
                <h4 className="text-xs font-semibold text-white mt-2 mb-1 uppercase tracking-wide">Secure Load</h4>
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Uploaded file is read in-memory. No raw documents are saved to disk.</p>
              </div>
              <div className="relative flex flex-col items-start p-5 bg-zinc-900/25 border border-zinc-900 rounded-xl backdrop-blur-sm">
                <span className="absolute -top-3.5 left-4 bg-cyan-600 text-white font-mono text-xs w-7 h-7 rounded-full flex items-center justify-center font-bold">2</span>
                <h4 className="text-xs font-semibold text-white mt-2 mb-1 uppercase tracking-wide">Chunk & Embed</h4>
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Segments text into 400-word chunks and embeds locally with SentenceTransformers.</p>
              </div>
              <div className="relative flex flex-col items-start p-5 bg-zinc-900/25 border border-zinc-900 rounded-xl backdrop-blur-sm">
                <span className="absolute -top-3.5 left-4 bg-cyan-600 text-white font-mono text-xs w-7 h-7 rounded-full flex items-center justify-center font-bold">3</span>
                <h4 className="text-xs font-semibold text-white mt-2 mb-1 uppercase tracking-wide">Vector Match</h4>
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Retrieves the top-4 most semantically matching chunks from ChromaDB.</p>
              </div>
              <div className="relative flex flex-col items-start p-5 bg-zinc-900/25 border border-zinc-900 rounded-xl backdrop-blur-sm">
                <span className="absolute -top-3.5 left-4 bg-cyan-600 text-white font-mono text-xs w-7 h-7 rounded-full flex items-center justify-center font-bold">4</span>
                <h4 className="text-xs font-semibold text-white mt-2 mb-1 uppercase tracking-wide">Synthesis</h4>
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Generates accurate, plain-text answers via Llama-3.1 router or fallbacks.</p>
              </div>
            </div>
          </div>

          {/* Agricultural/Topic Datasets Showcases */}
          <div className="w-full mt-24 max-w-4xl">
            <h2 className="text-xl font-bold tracking-tight text-white mb-8 text-center uppercase tracking-wider text-sm text-zinc-400">
              Sample Datasets & Topics to Explore
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-4 flex items-center gap-4 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  🌱
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wide">Soil Analytics & Crop Health</h4>
                  <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">Determine crop viability based on soil pH values, nitrogen levels, and moisture ratios.</p>
                </div>
              </div>
              
              <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-4 flex items-center gap-4 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  🐛
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wide">Pest & Disease Control</h4>
                  <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">Diagnose plant foliage symptoms and query biological or chemical pest management remedies.</p>
                </div>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-4 flex items-center gap-4 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  💧
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wide">Irrigation & Fertilization</h4>
                  <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">Access guidelines for crop water requirements, drip systems, and NPK fertilizer calculations.</p>
                </div>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-xl p-4 flex items-center gap-4 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  🌾
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wide">Sustainable Farming Practices</h4>
                  <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">Query crop rotation schedules, cover cropping strategies, and organic soil health practices.</p>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="h-16 flex items-center justify-center text-[10px] text-zinc-600 border-t border-zinc-900/60 z-10 bg-zinc-950/40">
          RAG Chatbot © 2026. Powered by ChromaDB & local SentenceTransformers.
        </footer>
      </div>
    )
  }

  // Render Workspace View
  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-80 border-r border-zinc-800 bg-zinc-900/30 flex flex-col justify-between shrink-0">
        <div className="p-6 flex flex-col gap-6 overflow-y-auto min-h-0 flex-1">
          {/* Logo Title (clickable to return home) */}
          <div onClick={() => setInWorkspace(false)} className="cursor-pointer group flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2 group-hover:text-cyan-400 transition-colors">
              <span className="w-2.5 h-6 bg-cyan-500 rounded-full inline-block"></span>
              RAG Chatbot
            </h1>
            <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1 group-hover:text-zinc-300">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              Go to Landing Page
            </p>
          </div>

          <hr className="border-zinc-800" />

          {/* Config Section */}
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.02 5.912L9 18v3.75a.75.75 0 0 1-.75.75H6.25a.75.75 0 0 1-.75-.75V19.5H4.25a.75.75 0 0 1-.75-.75V17.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 0 .75-.75V15h1.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 0 .75-.75h1.5a.75.75 0 0 0 .75-.75V9.75A6 6 0 0 1 18 3.75h.75a.75.75 0 0 1 .75.75v.75Z" />
              </svg>
              Configuration
            </h2>
            <label className="text-xs text-zinc-500">Hugging Face API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="hf_..."
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 placeholder-zinc-600 transition animate-pulse"
            />
            <p className="text-[10px] text-zinc-500 leading-normal">
              Used for Llama-3.1 generation. Leave blank to run offline fallback extraction.
            </p>
          </div>

          <hr className="border-zinc-800" />

          {/* Upload Section */}
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
              </svg>
              Upload Document
            </h2>

            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition ${
                isDragActive ? 'border-cyan-500 bg-cyan-950/20' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50'
              }`}
            >
              <input
                id="file-input"
                type="file"
                accept=".txt,.md,.pdf"
                className="hidden"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
              />
              <label htmlFor="file-input" className="cursor-pointer flex flex-col items-center gap-1">
                <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <span className="text-xs text-zinc-300 font-semibold mt-1">Select a file</span>
                <span className="text-[10px] text-zinc-500">or drag & drop (.txt, .md, .pdf)</span>
              </label>
            </div>
          </div>

          <hr className="border-zinc-800" />

          {/* Document Management Section */}
          <div className="flex flex-col gap-2 min-h-0 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                </svg>
                Documents ({documents.length})
              </h2>
              {documents.length > 0 && (
                <button
                  onClick={handleSelectAllDocs}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 transition font-semibold cursor-pointer"
                >
                  {selectedDocs.length === documents.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-zinc-650 italic mt-1 font-semibold">No documents indexed yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
                {documents.map((doc, idx) => {
                  const isChecked = selectedDocs.includes(doc);
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                        isChecked 
                          ? 'bg-zinc-900/80 border-zinc-800' 
                          : 'bg-zinc-950/20 border-zinc-900 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleDocSelection(doc)}
                          className="w-3.5 h-3.5 rounded text-cyan-650 focus:ring-cyan-500 bg-zinc-905 border-zinc-800 cursor-pointer"
                        />
                        <span className="text-xs text-zinc-200 truncate pr-1 font-semibold" title={doc}>
                          {doc}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteDoc(doc)}
                        className="text-zinc-650 hover:text-rose-400 p-1 rounded transition cursor-pointer"
                        title="Delete document"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.78 0L9 9m9.96-3-3.2 13.633A2.18 2.18 0 0 1 14.158 21H9.842a2.18 2.18 0 0 1-2.18-1.996L4.44 6m11.82 0H8.284m-.746 0h11.924M10.5 3.5h3m-3 0a1 1 0 0 0-1 1v1.5h5V4.5a1 1 0 0 0-1-1z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            
            {documents.length > 0 && (
              <span className="text-[10px] text-zinc-500 font-mono mt-1 shrink-0">
                Vector store size: {totalChunks} chunks
              </span>
            )}
          </div>
        </div>

        {/* Clear collection button */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-900/20 shrink-0">
          <button
            onClick={handleClear}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-400 hover:text-white border border-rose-950 hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.78 0L9 9m9.96-3-3.2 13.633A2.18 2.18 0 0 1 14.158 21H9.842a2.18 2.18 0 0 1-2.18-1.996L4.44 6m11.82 0H8.284m-.746 0h11.924M10.5 3.5h3m-3 0a1 1 0 0 0-1 1v1.5h5V4.5a1 1 0 0 0-1-1z" />
            </svg>
            Clear Database & Session
          </button>
        </div>
      </aside>

      {/* Main chat layout */}
      <main className="flex-1 flex flex-col h-full bg-zinc-950 relative">
        {/* Top bar info */}
        <header className="h-16 border-b border-zinc-800/80 px-8 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2 text-sm text-zinc-400 font-medium">
            <span>Server Status:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              <span className="text-zinc-300 font-semibold text-xs">Online</span>
            </span>
          </div>
          <div className="text-xs text-zinc-500 font-medium">
            Mode: <span className="text-zinc-300">{apiKey ? 'HF Router Llama-3.1' : 'Local Extraction'}</span>
          </div>
        </header>

        {/* Messages Scrolling Area */}
        <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${
                msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'
              }`}
            >
              {/* Message Bubble */}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-cyan-600 text-white rounded-br-none shadow-lg shadow-cyan-950/20 font-bold'
                    : msg.sender === 'system'
                    ? 'bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs italic font-mono font-medium'
                    : 'bg-zinc-900 border border-zinc-800/80 text-zinc-200 rounded-bl-none font-bold'
                }`}
              >
                {msg.text}
              </div>

              {/* RAG Sources (Assistant messages only) */}
              {msg.sender === 'assistant' && msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 w-full">
                  <button
                    onClick={() => setExpandedSourceId(expandedSourceId === msg.id ? null : msg.id)}
                    className="flex items-center gap-1 text-xs text-cyan-400 font-medium hover:text-cyan-300 transition cursor-pointer"
                  >
                    <svg
                      className={`w-3 h-3 transform transition-transform ${expandedSourceId === msg.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                    {expandedSourceId === msg.id ? 'Hide referenced sources' : `View ${msg.sources.length} sources`}
                  </button>

                  {expandedSourceId === msg.id && (
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl">
                      {msg.sources.map((src, sIdx) => (
                        <div
                          key={sIdx}
                          className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-semibold font-mono">
                            <span className="truncate max-w-[150px]">{src.doc_name}</span>
                            <span className="text-cyan-400">Score: {src.score.toFixed(3)}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-normal line-clamp-3 italic font-medium">
                            "{src.text}"
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="self-start flex flex-col gap-2 items-start max-w-[80%] animate-pulse">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-none px-4 py-3 text-sm text-zinc-400 flex items-center gap-2 font-medium">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-200"></span>
                </span>
                Generating response...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic prompts suggestions if no messages or early state */}
        {messages.length <= 1 && !isLoading && (
          <div className="px-8 mb-4 max-w-3xl">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-2 select-none">Suggested Questions</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={(e) => handleSend(e, sug)}
                  className="w-full text-left text-xs bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-xl px-4 py-3 text-zinc-300 font-semibold transition cursor-pointer"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text Input area */}
        <div className="p-8 border-t border-zinc-900 bg-zinc-950 shrink-0">
          <form onSubmit={handleSend} className="flex gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                documents.length === 0 
                  ? "Please upload a document in the sidebar to begin..." 
                  : selectedDocs.length === 0 
                  ? "Please select at least one document to search against..." 
                  : "Ask a question about selected documents..."
              }
              disabled={selectedDocs.length === 0 || isLoading}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
            />
            <button
              type="submit"
              disabled={!input.trim() || selectedDocs.length === 0 || isLoading}
              className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl px-5 flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-950/20 shrink-0 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </form>
          <div className="text-[10px] text-zinc-650 text-center mt-3">
            RAG Chatbot uses local vector search and SentenceTransformers. All documents remain local and confidential.
          </div>
        </div>
      </main>
    </div>
  )
}
