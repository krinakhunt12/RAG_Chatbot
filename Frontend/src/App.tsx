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

const faqData = [
  {
    q: "What is Retrieval-Augmented Generation (RAG)?",
    a: "RAG is an AI framework that connects a Large Language Model (LLM) to an external, private data source (like your uploaded company reports, PDFs, or technical guides). Instead of relying only on what the LLM learned during its training, it first searches your documents for facts matching your question, feeds those facts into the LLM, and asks the LLM to write an answer based strictly on those facts. This prevents 'hallucinations' and keeps the answers highly accurate."
  },
  {
    q: "Is my corporate data safe and private?",
    a: "Yes, 100%. Everything runs locally on your machine. When you upload files (such as reports or guides), they are read, chunked, and stored in a local ChromaDB SQLite instance in your backend folder. The text embeddings are calculated using a local SentenceTransformer model. No raw files or sensitive data are uploaded to external clouds."
  },
  {
    q: "What file formats can I index in the workspace?",
    a: "The assistant currently supports plain text files (.txt), Markdown documentation (.md), and standard PDF documents (.pdf). The parser extracts the text from these files, splits them into semantic paragraphs, and indexes them in ChromaDB automatically."
  },
  {
    q: "Do I need a Hugging Face API key to use this?",
    a: "A Hugging Face API key is recommended to run the advanced Llama-3.1 router for synthesis. However, if you leave the key blank, the system will use a local fallback engine that directly extracts relevant paragraphs from the matching document chunks, allowing you to run completely offline without an internet connection!"
  }
]

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

  // Scroll to Top States & Ref
  const [showScrollTop, setShowScrollTop] = useState(false)
  const landingPageRef = useRef<HTMLDivElement>(null)

  // Mobile sidebar toggle state
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 350) {
      setShowScrollTop(true)
    } else {
      setShowScrollTop(false)
    }
  }

  const scrollToTop = () => {
    landingPageRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Simulator States
  const [selectedSimIndex, setSelectedSimIndex] = useState<number | null>(null)
  const [simStep, setSimStep] = useState<number>(0)
  const [simAnswerText, setSimAnswerText] = useState<string>('')
  const [isSimulating, setIsSimulating] = useState<boolean>(false)
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  const simTimeout1 = useRef<any>(null)
  const simTimeout2 = useRef<any>(null)
  const simTimeout3 = useRef<any>(null)
  const simInterval = useRef<any>(null)

  const clearSimEffects = () => {
    if (simTimeout1.current) clearTimeout(simTimeout1.current)
    if (simTimeout2.current) clearTimeout(simTimeout2.current)
    if (simTimeout3.current) clearTimeout(simTimeout3.current)
    if (simInterval.current) clearInterval(simInterval.current)
  }

  const simCases = [
    {
      query: "What are Apple's main product lines and revenue sources?",
      doc: "Apple.txt",
      score: 0.912,
      chunk: "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories. Its key revenue lines include iPhone, Mac, iPad, and a rapidly expanding Services segment (including App Store, Apple Music, Apple Pay, and iCloud).",
      answer: "Apple's primary product lines comprise hardware devices such as the iPhone, Mac personal computers, iPad tablets, and wearables (like Apple Watch and AirPods). In addition to hardware, Apple generates significant and growing revenue from its Services division, which includes the App Store, iCloud, Apple Music, Apple Pay, and Apple TV+."
    },
    {
      query: "How does Microsoft license its cloud and enterprise software?",
      doc: "Microsoft.txt",
      score: 0.887,
      chunk: "Microsoft offers cloud-based services through Microsoft Azure, Office 365, and Dynamics. Enterprise software is licensed primarily via commercial agreements, software assurance programs, and per-user subscription plans.",
      answer: "Microsoft licenses its cloud services and enterprise software using per-user monthly or annual subscriptions (such as Office 365 and Microsoft 365), consumption-based billing models for Azure cloud hosting, and enterprise-wide volume licensing contracts for server and database platforms."
    },
    {
      query: "What is Nvidia's primary business segment?",
      doc: "Nvidia.txt",
      score: 0.934,
      chunk: "Nvidia operates in two primary segments: Graphics and Compute & Networking. The Graphics segment includes GeForce GPUs for gaming and PCs. Compute & Networking includes Data Center platforms, AI accelerators, and networking solutions like Mellanox.",
      answer: "Nvidia operates in two key business segments: Compute & Networking, which encompasses their high-performance AI accelerators, Data Center GPU architectures, and networking gear; and Graphics, which covers the GeForce GPU product lines for gaming, visual design, and creator PCs."
    }
  ]

  const runSimulation = (idx: number) => {
    clearSimEffects()
    setIsSimulating(true)
    setSelectedSimIndex(idx)
    setSimStep(1)
    setSimAnswerText('')

    simTimeout1.current = setTimeout(() => {
      setSimStep(2)
      
      simTimeout2.current = setTimeout(() => {
        setSimStep(3)
        
        simTimeout3.current = setTimeout(() => {
          setSimStep(4)
          
          const fullText = simCases[idx].answer
          let currentText = ''
          let charIdx = 0
          simInterval.current = setInterval(() => {
            if (charIdx < fullText.length) {
              currentText += fullText.charAt(charIdx)
              setSimAnswerText(currentText)
              charIdx++
            } else {
              clearInterval(simInterval.current)
              setIsSimulating(false)
            }
          }, 12)
        }, 1000)
      }, 1000)
    }, 1000)
  }

  // Fetch current database info on mount
  useEffect(() => {
    fetchInfo(true)
    return () => clearSimEffects()
  }, [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Scroll Reveal Intersection Observer for landing page content
  useEffect(() => {
    if (inWorkspace) return

    const timeout = setTimeout(() => {
      const revealElements = document.querySelectorAll('.reveal-on-scroll')
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('revealed')
            }
          })
        },
        {
          threshold: 0.05,
          rootMargin: '0px 0px -40px 0px'
        }
      )

      revealElements.forEach((el) => observer.observe(el))

      return () => {
        revealElements.forEach((el) => observer.unobserve(el))
        observer.disconnect()
      }
    }, 150)

    return () => clearTimeout(timeout)
  }, [inWorkspace])

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
      alert('Please select at least one document in the sidebar to search against.')
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
    "What are Apple's main product lines and revenue sources?",
    "How does Microsoft license its cloud services?",
    "What is Nvidia's primary business segment?"
  ]

  // Render Landing Page View
  if (!inWorkspace) {
    return (
      <div
        ref={landingPageRef}
        onScroll={handleScroll}
        className="min-h-screen w-screen bg-[#09090b] text-slate-200 overflow-y-auto relative flex flex-col justify-between font-sans bg-grid-pattern"
      >
        {/* Ambient Glowing Blobs */}
        <div className="absolute top-10 left-10 w-[450px] h-[450px] bg-cyan-500/5 rounded-full filter blur-3xl opacity-30 animate-blob pointer-events-none"></div>
        <div className="absolute bottom-20 right-10 w-[500px] h-[500px] bg-indigo-500/5 rounded-full filter blur-3xl opacity-20 animate-blob animation-delay-2000 pointer-events-none"></div>
        <div className="absolute top-1/3 left-1/3 w-[350px] h-[350px] bg-cyan-600/5 rounded-full filter blur-3xl opacity-15 animate-blob animation-delay-4000 pointer-events-none"></div>

        {/* Navigation Bar */}
        <header className="max-w-6xl w-full mx-auto px-6 h-20 flex items-center justify-between z-10 border-b border-zinc-900/60 backdrop-blur-md sticky top-0 bg-[#09090b]/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h1.5m-1.5 3H12m-9-15h12.75c.621 0 1.125.504 1.125 1.125V18a1.125 1.125 0 0 1-1.125 1.125H5.625A1.125 1.125 0 0 1 4.5 18V6.225" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-white font-sans flex items-center gap-1.5">
              RAG Chatbot <span className="text-cyan-400 text-xs px-2 py-0.5 rounded-full bg-cyan-950/50 border border-cyan-800/40">v1.2</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 bg-zinc-900/40 px-3.5 py-1.5 rounded-full border border-zinc-800/60 text-[11px] text-cyan-400 font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block animate-pulse"></span>
              Local Engine Active
            </span>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl w-full mx-auto px-6 py-16 flex flex-col items-center justify-center z-10 flex-1 gap-24">
          
          {/* Hero Section */}
          <section className="flex flex-col items-center text-center max-w-4xl reveal-on-scroll">
            <div className="inline-flex items-center gap-2 bg-cyan-500/10 text-cyan-400 text-xs font-semibold px-4 py-2 rounded-full border border-cyan-500/20 mb-6 tracking-wide uppercase select-none">
              📂 Local Context & Intelligent Document Synthesis
            </div>

            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
              Analyze Corporate Data. <br />
              <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-cyan-500 bg-clip-text text-transparent glow-text-cyan">
                Synthesize Clear Answers.
              </span>
            </h1>

            <p className="text-slate-400 text-md md:text-lg max-w-2xl leading-relaxed mb-10 font-medium">
              A private, secure Retrieval-Augmented Generation assistant. Index your company reports, business manuals, and study guides locally to get instant, cited answers under complete privacy.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
              <button
                onClick={() => setInWorkspace(true)}
                className="group px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-md flex items-center gap-2.5 transition glow-btn-cyan hover-shine cursor-pointer"
              >
                Open Chat Workspace
                <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
              <a
                href="#how-it-works-simulator"
                className="px-6 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 text-slate-300 font-bold rounded-xl text-md transition cursor-pointer"
              >
                See How It Works
              </a>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-16 max-w-4xl">
              <div className="bg-zinc-900/10 border border-zinc-800/30 rounded-2xl p-5 text-center backdrop-blur-md reveal-on-scroll reveal-delay-75">
                <p className="text-3xl font-extrabold text-white font-mono">100%</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mt-1">Local Data Privacy</p>
              </div>
              <div className="bg-zinc-900/10 border border-zinc-800/30 rounded-2xl p-5 text-center backdrop-blur-md reveal-on-scroll reveal-delay-150">
                <p className="text-3xl font-extrabold text-cyan-400 font-mono">384</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mt-1">Embedding Dims</p>
              </div>
              <div className="bg-zinc-900/10 border border-zinc-800/30 rounded-2xl p-5 text-center backdrop-blur-md reveal-on-scroll reveal-delay-225">
                <p className="text-3xl font-extrabold text-cyan-400 font-mono">Chroma</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mt-1">Vector Indexing</p>
              </div>
              <div className="bg-zinc-900/10 border border-zinc-800/30 rounded-2xl p-5 text-center backdrop-blur-md reveal-on-scroll reveal-delay-300">
                <p className="text-3xl font-extrabold text-white font-mono">&lt; 15ms</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mt-1">Search Latency</p>
              </div>
            </div>
          </section>

          {/* Interactive RAG Simulator Section */}
          <section id="how-it-works-simulator" className="w-full max-w-4xl flex flex-col items-center reveal-on-scroll">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Interactive RAG Simulator</h2>
              <p className="text-slate-400 text-sm max-w-xl mx-auto font-medium">
                Click a sample document question below to watch how our local RAG pipeline processes files, runs vector queries, and synthesizes answers step-by-step.
              </p>
            </div>

            <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
              
              {/* Simulator Question Selector */}
              <div className="md:col-span-5 flex flex-col gap-3">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider select-none mb-1">
                  Select a Sample Query
                </span>
                {simCases.map((c, idx) => (
                  <button
                    key={idx}
                    onClick={() => runSimulation(idx)}
                    disabled={isSimulating && selectedSimIndex === idx}
                    className={`text-left p-4 rounded-xl border font-semibold transition text-xs flex items-center justify-between gap-3 cursor-pointer ${
                      selectedSimIndex === idx
                        ? 'bg-cyan-950/40 border-cyan-500/70 text-cyan-300'
                        : 'bg-zinc-900/30 border-zinc-800/60 hover:bg-zinc-900/50 hover:border-zinc-700 text-slate-300'
                    }`}
                  >
                    <span>{c.query}</span>
                    <span className="shrink-0 text-cyan-500 text-base">➔</span>
                  </button>
                ))}

                <div className="p-4 bg-zinc-900/30 border border-zinc-800/60 rounded-xl mt-2">
                  <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    🗃️ Active Document Store
                  </h4>
                  <p className="text-[10px] text-zinc-500 leading-relaxed font-semibold">
                    Simulates retrieving facts from uploaded company files: <br />
                    • <span className="text-slate-300">Apple.txt</span> <br />
                    • <span className="text-slate-300">Microsoft.txt</span> <br />
                    • <span className="text-slate-300">Nvidia.txt</span>
                  </p>
                </div>
              </div>

              {/* Simulator Visual Pipeline */}
              <div className="md:col-span-7 bg-[#0f0f13] border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between min-h-[360px] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full filter blur-xl"></div>
                
                {selectedSimIndex === null ? (
                  /* Initial State */
                  <div className="flex flex-col items-center justify-center flex-1 text-center py-8">
                    <div className="w-14 h-14 rounded-full bg-cyan-950/40 border border-cyan-900/30 flex items-center justify-center mb-4">
                      <svg className="w-7 h-7 text-cyan-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 21l8.982-5.03c1.519-.852 2.518-2.451 2.518-4.22V8.25m-18 0a9 9 0 1 1 18 0v3.75m-18 0A8.961 8.961 0 0 0 12 15a8.961 8.961 0 0 0 3-.518M6.75 12h.008v.008H6.75V12Zm3 0h.008v.008H9.75V12Zm3 0h.008v.008H12.75V12Z" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-bold text-slate-200">Interactive Pipeline Console</h4>
                    <p className="text-xs text-slate-500 max-w-sm mt-2 leading-relaxed font-semibold">
                      Select one of the sample company queries on the left. You will see how the local RAG system tokenizes words, pulls the matching paragraph, and builds the LLM prompt.
                    </p>
                  </div>
                ) : (
                  /* Active Simulation State */
                  <div className="flex flex-col flex-1">
                    
                    {/* Pipeline Steps Indicator */}
                    <div className="grid grid-cols-4 gap-2 mb-5 text-[9px] uppercase tracking-widest text-center font-bold font-mono select-none">
                      <div className={`py-1 rounded border transition ${simStep >= 1 ? 'border-cyan-500 bg-cyan-950/30 text-cyan-400' : 'border-zinc-800 text-slate-600'}`}>
                        1. Embed
                      </div>
                      <div className={`py-1 rounded border transition ${simStep >= 2 ? 'border-cyan-500 bg-cyan-950/30 text-cyan-400' : 'border-zinc-800 text-slate-600'}`}>
                        2. Fetch
                      </div>
                      <div className={`py-1 rounded border transition ${simStep >= 3 ? 'border-cyan-500 bg-cyan-950/30 text-cyan-400' : 'border-zinc-800 text-slate-600'}`}>
                        3. Prompt
                      </div>
                      <div className={`py-1 rounded border transition ${simStep >= 4 ? 'border-cyan-500 bg-cyan-950/30 text-cyan-400' : 'border-zinc-800 text-slate-600'}`}>
                        4. Solve
                      </div>
                    </div>

                    {/* Console Logs */}
                    <div className="flex-1 flex flex-col gap-4 font-mono text-xs overflow-y-auto pr-1">
                      
                      {/* Step 1 Log */}
                      {simStep >= 1 && (
                        <div className="flex flex-col gap-1 border-l-2 border-cyan-500 pl-3">
                          <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider">➔ Stage 1: Text Embedding Generation</span>
                          <p className="text-slate-400 text-[11px] leading-relaxed">
                            Vectorizing query <span className="text-white">"{simCases[selectedSimIndex].query}"</span>. <br />
                            Using local sentence embedding model <span className="text-cyan-400">all-MiniLM-L6-v2</span>. Generated float32 array (384 dimensions).
                          </p>
                        </div>
                      )}

                      {/* Step 2 Log */}
                      {simStep >= 2 && (
                        <div className="flex flex-col gap-1 border-l-2 border-cyan-500 pl-3">
                          <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider">➔ Stage 2: ChromaDB Vector Query</span>
                          <p className="text-slate-400 text-[11px] leading-relaxed">
                            Matched top chunk in <span className="text-white font-bold">{simCases[selectedSimIndex].doc}</span> with similarity score: <span className="text-cyan-400 font-bold">{simCases[selectedSimIndex].score}</span>
                          </p>
                          <div className="bg-cyan-955/10 border border-cyan-900/20 rounded p-2 text-[10px] text-slate-350 italic max-h-16 overflow-y-auto">
                            "{simCases[selectedSimIndex].chunk}"
                          </div>
                        </div>
                      )}

                      {/* Step 3 Log */}
                      {simStep >= 3 && (
                        <div className="flex flex-col gap-1 border-l-2 border-cyan-500 pl-3">
                          <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider">➔ Stage 3: Prompt Synthesizer Construction</span>
                          <p className="text-slate-400 text-[10px] leading-snug">
                            Compiling payload context:
                          </p>
                          <pre className="bg-[#050508] border border-zinc-850 p-2.5 rounded text-[9px] text-cyan-600 overflow-x-auto whitespace-pre">
{`SYSTEM: Answer query strictly using verified facts below.
CONTEXT:
Source: ${simCases[selectedSimIndex].doc}
"${simCases[selectedSimIndex].chunk}"
-------------------
QUESTION: ${simCases[selectedSimIndex].query}`}
                          </pre>
                        </div>
                      )}

                      {/* Step 4 Log */}
                      {simStep >= 4 && (
                        <div className="flex flex-col gap-2 border-l-2 border-cyan-400 pl-3">
                          <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">➔ Stage 4: Local RAG Answer Generated</span>
                          <div className="bg-cyan-950/20 border border-cyan-800/40 rounded-xl p-3 text-slate-200 text-[11px] leading-relaxed relative">
                            {simAnswerText}
                            <span className="inline-block w-1.5 h-3 bg-cyan-400 animate-cursor ml-0.5"></span>
                            
                            {!isSimulating && (
                              <div className="mt-2 pt-2 border-t border-zinc-800/40 text-[9px] text-slate-400 flex items-center justify-between font-mono">
                                <span className="font-bold">Source Citation: [{simCases[selectedSimIndex].doc}]</span>
                                <span className="text-cyan-400 font-semibold">✓ Grounded Response</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Workflow Steps Details */}
          <section className="w-full max-w-4xl">
            <div className="text-center mb-12 reveal-on-scroll">
              <h2 className="text-3xl font-bold tracking-tight text-white mb-2">How the Local RAG Engine Works</h2>
              <p className="text-slate-400 text-sm max-w-xl mx-auto font-medium">
                The architecture splits the workload between local vector embeddings and cloud-based response routing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              <div className="relative flex flex-col items-start p-6 bg-zinc-900/10 border border-zinc-800/40 rounded-2xl backdrop-blur-sm hover:border-zinc-700/50 transition duration-300 reveal-on-scroll reveal-delay-75">
                <span className="bg-cyan-950 text-cyan-400 font-mono text-xs w-8 h-8 rounded-full flex items-center justify-center font-bold border border-cyan-900/30 mb-4">1</span>
                <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-wide">Document Ingestion</h4>
                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                  Parses PDFs, Markdowns, or Text files locally. It extracts paragraphs and cleans formatting before splitting into clean text fragments.
                </p>
              </div>

              <div className="relative flex flex-col items-start p-6 bg-zinc-900/10 border border-zinc-800/40 rounded-2xl backdrop-blur-sm hover:border-zinc-700/50 transition duration-300 reveal-on-scroll reveal-delay-150">
                <span className="bg-cyan-950 text-cyan-400 font-mono text-xs w-8 h-8 rounded-full flex items-center justify-center font-bold border border-cyan-900/30 mb-4">2</span>
                <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-wide">Local Embeddings</h4>
                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                  Generates sentence embeddings using SentenceTransformers model offline, mapping texts to highly precise vector math representations.
                </p>
              </div>

              <div className="relative flex flex-col items-start p-6 bg-zinc-900/10 border border-zinc-800/40 rounded-2xl backdrop-blur-sm hover:border-zinc-700/50 transition duration-300 reveal-on-scroll reveal-delay-225">
                <span className="bg-cyan-950 text-cyan-400 font-mono text-xs w-8 h-8 rounded-full flex items-center justify-center font-bold border border-cyan-900/30 mb-4">3</span>
                <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-wide">Vector DB Match</h4>
                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                  Queries a local ChromaDB collection using cosine similarity index, returning the top matching fragments under 15ms.
                </p>
              </div>

              <div className="relative flex flex-col items-start p-6 bg-zinc-900/10 border border-zinc-800/40 rounded-2xl backdrop-blur-sm hover:border-zinc-700/50 transition duration-300 reveal-on-scroll reveal-delay-300">
                <span className="bg-cyan-950 text-cyan-400 font-mono text-xs w-8 h-8 rounded-full flex items-center justify-center font-bold border border-cyan-900/30 mb-4">4</span>
                <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-wide">Synthesis & Citation</h4>
                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                  Compiles retrieved fragments alongside your question to feed the Llama-3.1 API. Outputs include precise references to source document filenames.
                </p>
              </div>
              
            </div>
          </section>

          {/* Capabilities Grid */}
          <section className="w-full max-w-4xl">
            <div className="text-center mb-12 reveal-on-scroll">
              <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Capabilities & Use Cases</h2>
              <p className="text-slate-400 text-sm max-w-xl mx-auto font-medium">
                Tailor your assistant database with manuals and guides. Discover typical research areas you can query.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-zinc-900/10 border border-zinc-800/40 rounded-2xl p-6 flex items-start gap-4 hover:border-zinc-700/50 transition duration-300 reveal-on-scroll reveal-delay-75">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 text-xl shadow-inner">
                  📈
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Financial & Business Reports</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1 font-semibold">
                    Upload financial reports, earnings summaries, and balance sheets. Query revenue segments, cash flow projections, and product performances.
                  </p>
                </div>
              </div>

              <div className="bg-zinc-900/10 border border-zinc-800/40 rounded-2xl p-6 flex items-start gap-4 hover:border-zinc-700/50 transition duration-300 reveal-on-scroll reveal-delay-150">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 text-xl shadow-inner">
                  💻
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Technical Documentation</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1 font-semibold">
                    Crawl API guides, coding standards, and architectural blueprints. Access configuration parameters and deployment steps instantly.
                  </p>
                </div>
              </div>

              <div className="bg-zinc-900/10 border border-zinc-800/40 rounded-2xl p-6 flex items-start gap-4 hover:border-zinc-700/50 transition duration-300 reveal-on-scroll reveal-delay-225">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 text-xl shadow-inner">
                  📑
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Corporate Policies & Handbooks</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1 font-semibold">
                    Search internal operations files, HR policies, onboarding scripts, compliance rulebooks, and business standards.
                  </p>
                </div>
              </div>

              <div className="bg-zinc-900/10 border border-zinc-800/40 rounded-2xl p-6 flex items-start gap-4 hover:border-zinc-700/50 transition duration-300 reveal-on-scroll reveal-delay-300">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 text-xl shadow-inner">
                  🛡️
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">100% Data Confidentiality</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1 font-semibold">
                    All document text vectors are stored in a local SQLite vector database. Your private intellectual property never leaves your computer.
                  </p>
                </div>
              </div>

            </div>
          </section>

          {/* Interactive FAQ / Accordion */}
          <section className="w-full max-w-3xl">
            <div className="text-center mb-12 reveal-on-scroll">
              <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Frequently Asked Questions</h2>
              <p className="text-slate-400 text-sm max-w-xl mx-auto font-medium">
                Learn more about RAG, local installation parameters, and offline functionality.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {faqData.map((item, idx) => {
                const isOpen = activeFaq === idx
                return (
                  <div
                    key={idx}
                    className="border border-zinc-800/60 rounded-2xl bg-zinc-900/10 overflow-hidden transition-all duration-300 reveal-on-scroll"
                    style={{ transitionDelay: `${idx * 75}ms` }}
                  >
                    <button
                      onClick={() => setActiveFaq(isOpen ? null : idx)}
                      className="w-full px-6 py-4 text-left font-bold text-slate-200 flex justify-between items-center text-sm gap-4 cursor-pointer hover:bg-zinc-900/20 transition"
                    >
                      <span>{item.q}</span>
                      <span className={`text-cyan-500 transition-transform duration-300 font-mono text-lg ${isOpen ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    
                    <div
                      className={`transition-all duration-300 ease-in-out ${
                        isOpen ? 'max-h-52 opacity-100 border-t border-zinc-800/40 p-6' : 'max-h-0 opacity-0 overflow-hidden'
                      }`}
                    >
                      <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                        {item.a}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

        </main>

        {/* Footer */}
        <footer className="h-20 flex items-center justify-center text-[11px] text-zinc-650 border-t border-zinc-900/60 z-10 bg-[#09090b]">
          RAG Chatbot © 2026. Built with local ChromaDB, SentenceTransformers, and Llama 3.1.
        </footer>

        {/* Floating Scroll to Top Button */}
        <button
          onClick={scrollToTop}
          className={`fixed bottom-6 right-6 p-3 rounded-full bg-zinc-900/90 border border-cyan-800/40 text-cyan-400 hover:text-white transition-all duration-300 z-50 cursor-pointer shadow-lg hover:border-cyan-500 hover:shadow-cyan-950/40 hover:-translate-y-1 ${
            showScrollTop ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
          }`}
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5 text-cyan-400 hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>
      </div>
    )
  }

  // Render Workspace View
  return (
    <div className="flex h-screen w-screen bg-[#09090b] text-slate-200 overflow-hidden font-sans relative">
      {/* Mobile Sidebar Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden transition-opacity duration-300"
        />
      )}

      {/* Sidebar Drawer Container */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-80 border-r border-zinc-800/80 bg-[#09090b] flex flex-col justify-between shrink-0 transform transition-transform duration-300 md:relative md:translate-x-0 md:z-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-6 flex flex-col gap-6 overflow-y-auto min-h-0 flex-1">
          {/* Logo Title & Mobile Close Button */}
          <div className="flex items-center justify-between">
            <div onClick={() => { setInWorkspace(false); setSidebarOpen(false); }} className="cursor-pointer group flex flex-col">
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2 group-hover:text-cyan-400 transition-colors">
                <span className="w-2.5 h-6 bg-cyan-500 rounded-full inline-block"></span>
                RAG Workspace
              </h1>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 group-hover:text-slate-350">
                <svg className="w-3.5 h-3.5 text-cyan-555" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
                Go to Landing Page
              </p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-zinc-800/40 cursor-pointer"
              aria-label="Close sidebar"
            >
              <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <hr className="border-zinc-800/80" />

          {/* Config Section */}
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.02 5.912L9 18v3.75a.75.75 0 0 1-.75.75H6.25a.75.75 0 0 1-.75-.75V19.5H4.25a.75.75 0 0 1-.75-.75V17.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 0 .75-.75V15h1.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 0 .75-.75h1.5a.75.75 0 0 0 .75-.75V9.75A6 6 0 0 1 18 3.75h.75a.75.75 0 0 1 .75.75v.75Z" />
              </svg>
              Authentication
            </h2>
            <label className="text-xs text-slate-500 font-semibold">Hugging Face API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="hf_..."
              className="w-full px-3 py-2 bg-[#0d0d11] border border-zinc-800/80 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500 placeholder-zinc-700 transition"
            />
            <p className="text-[10px] text-slate-500 leading-normal font-semibold">
              Enables Llama-3.1 API. Leave empty for offline local keyword fallback extraction.
            </p>
          </div>

          <hr className="border-zinc-800/80" />

          {/* Upload Section */}
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
              </svg>
              Upload Documents
            </h2>

            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition ${
                isDragActive ? 'border-cyan-500 bg-cyan-950/20' : 'border-zinc-800 hover:border-zinc-700 bg-[#0d0d11]/50'
              }`}
            >
              <input
                id="file-input"
                type="file"
                accept=".txt,.md,.pdf"
                className="hidden"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
              />
              <label htmlFor="file-input" className="cursor-pointer flex flex-col items-center gap-1.5">
                <svg className="w-8 h-8 text-cyan-700/60 animate-pulse" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <span className="text-xs text-slate-300 font-bold mt-1">Choose File</span>
                <span className="text-[9px] text-slate-500 font-semibold">Drag & drop (.pdf, .txt, .md)</span>
              </label>
            </div>
          </div>

          <hr className="border-zinc-800/80" />

          {/* Document Management Section */}
          <div className="flex flex-col gap-2 min-h-0 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                </svg>
                Documents ({documents.length})
              </h2>
              {documents.length > 0 && (
                <button
                  onClick={handleSelectAllDocs}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 transition font-bold cursor-pointer"
                >
                  {selectedDocs.length === documents.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-slate-500 italic mt-1 font-semibold">No files uploaded yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
                {documents.map((doc, idx) => {
                  const isChecked = selectedDocs.includes(doc);
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                        isChecked 
                          ? 'bg-[#141419] border-zinc-800' 
                          : 'bg-zinc-900/5 border-transparent opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleDocSelection(doc)}
                          className="w-3.5 h-3.5 rounded text-cyan-650 focus:ring-cyan-500 bg-[#0d0d11] border-zinc-850 cursor-pointer"
                        />
                        <span className="text-xs text-slate-200 truncate pr-1 font-semibold" title={doc}>
                          {doc}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteDoc(doc)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition cursor-pointer"
                        title="Delete manual"
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
              <span className="text-[10px] text-zinc-500 font-mono mt-2 shrink-0 select-none">
                Chroma db size: {totalChunks} paragraphs indexed
              </span>
            )}
          </div>
        </div>

        {/* Clear collection button */}
        <div className="p-6 border-t border-zinc-800/80 bg-[#0d0d11]/30 shrink-0 font-sans">
          <button
            onClick={handleClear}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-rose-400 hover:text-white border border-rose-950/80 hover:bg-rose-950/20 rounded-lg transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.78 0L9 9m9.96-3-3.2 13.633A2.18 2.18 0 0 1 14.158 21H9.842a2.18 2.18 0 0 1-2.18-1.996L4.44 6m11.82 0H8.284m-.746 0h11.924M10.5 3.5h3m-3 0a1 1 0 0 0-1 1v1.5h5V4.5a1 1 0 0 0-1-1z" />
            </svg>
            Purge Vector Database
          </button>
        </div>
      </aside>

      {/* Main chat layout */}
      <main className="flex-1 flex flex-col h-full bg-[#09090b] relative">
        
        {/* Top bar info */}
        <header className="h-16 border-b border-zinc-800/60 px-6 md:px-8 flex items-center justify-between bg-[#09090b]/60 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-zinc-800/40 cursor-pointer transition"
              aria-label="Open sidebar"
            >
              <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            
            <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
              <span className="hidden sm:inline">RAG Engine Status:</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block animate-pulse"></span>
                <span className="text-cyan-400 font-bold text-xs select-none">Active</span>
              </span>
            </div>
          </div>
          
          <div className="text-xs text-slate-405 font-semibold">
            <span className="hidden md:inline">Synthesis Router: </span>
            <span className="text-cyan-400">{apiKey ? 'Llama-3.1 Cloud API' : 'Local Extraction'}</span>
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
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed border ${
                  msg.sender === 'user'
                    ? 'bg-cyan-700 border-cyan-600 text-white rounded-br-none shadow-lg font-semibold'
                    : msg.sender === 'system'
                    ? 'bg-[#050508] border-zinc-850 text-cyan-600 text-xs italic font-mono'
                    : 'bg-[#121217] border-zinc-850 text-slate-200 rounded-bl-none font-medium'
                }`}
              >
                {msg.text}
              </div>

              {/* RAG Sources */}
              {msg.sender === 'assistant' && msg.sources && msg.sources.length > 0 && (
                <div className="mt-2.5 w-full">
                  <button
                    onClick={() => setExpandedSourceId(expandedSourceId === msg.id ? null : msg.id)}
                    className="flex items-center gap-1 text-xs text-cyan-400 font-bold hover:text-cyan-300 transition cursor-pointer"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transform transition-transform ${expandedSourceId === msg.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                    {expandedSourceId === msg.id ? 'Hide referenced context sources' : `View ${msg.sources.length} matching sources`}
                  </button>

                  {expandedSourceId === msg.id && (
                    <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5 max-w-3xl">
                      {msg.sources.map((src, sIdx) => (
                        <div
                          key={sIdx}
                          className="bg-[#121217] border border-zinc-800/80 rounded-xl p-3 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between text-[10px] text-cyan-500 font-bold font-mono">
                            <span className="truncate max-w-[170px]" title={src.doc_name}>{src.doc_name}</span>
                            <span className="bg-cyan-955/30 border border-cyan-900/40 px-1.5 py-0.5 rounded text-cyan-400">Score: {src.score.toFixed(3)}</span>
                          </div>
                          <p className="text-[11px] text-slate-450 leading-relaxed italic font-medium">
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
              <div className="bg-[#121217] border border-zinc-800 rounded-2xl rounded-bl-none px-4 py-3 text-sm text-cyan-500 flex items-center gap-2 font-semibold font-mono">
                <span className="flex gap-1.5">
                  <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce delay-200"></span>
                </span>
                Vectorizing query & querying database...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic prompts suggestions */}
        {messages.length <= 1 && !isLoading && (
          <div className="px-8 mb-4 max-w-3xl">
            <p className="text-xs text-cyan-500 font-bold uppercase tracking-wider mb-2.5 select-none">Suggested Queries</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={(e) => handleSend(e, sug)}
                  className="w-full text-left text-xs bg-zinc-900/30 hover:bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 rounded-xl px-4 py-3 text-slate-300 font-semibold transition cursor-pointer"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text Input area */}
        <div className="p-8 border-t border-zinc-900 bg-[#09090b] shrink-0">
          <form onSubmit={handleSend} className="flex gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                documents.length === 0 
                  ? "Please upload a document in the sidebar to begin..." 
                  : selectedDocs.length === 0 
                  ? "Please check at least one document in the sidebar..." 
                  : "Ask a question about your documents..."
              }
              disabled={selectedDocs.length === 0 || isLoading}
              className="flex-1 bg-[#0d0d11] border border-zinc-800/80 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-zinc-650 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
            />
            <button
              type="submit"
              disabled={!input.trim() || selectedDocs.length === 0 || isLoading}
              className="bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl px-5 flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shrink-0 cursor-pointer"
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </form>
          <div className="text-[10px] text-zinc-650 text-center mt-3 font-semibold select-none">
            All files indexed locally in SQLite Chroma Vector database. Your confidential files remain local on your workspace.
          </div>
        </div>
        
      </main>
    </div>
  )
}
