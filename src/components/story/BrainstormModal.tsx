'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Wand2, ArrowUp, Loader2, MessageSquareText } from 'lucide-react';
import { TiptapEditor } from '../editor/TiptapEditor';

interface BrainstormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (text: string) => void;
  initialContent?: string;
}

export function BrainstormModal({ isOpen, onClose, onApply, initialContent }: BrainstormModalProps) {
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const modalEditorRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialContent) {
        setChatHistory([{ role: 'ai', content: `I'm ready to help you edit your story. You can chat with me here to make changes!` }]);
      } else {
        setChatHistory([]);
      }
    } else {
      setChatHistory([]);
      setChatInput('');
    }
  }, [isOpen, initialContent]);

  if (!isOpen) return null;



  const handleChat = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsAiLoading(true);
    
    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'ask',
          content: { 
            selectedText: modalEditorRef.current?.getText() || '', 
            userQuestion: userMsg 
          }
        }),
      });

      if (!res.ok) throw new Error('Failed to chat');
      const data = await res.json();
      if (data.result) {
        setChatHistory(prev => [...prev, { role: 'ai', content: data.result }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApply = () => {
    const html = modalEditorRef.current?.getHTML() || '';
    onApply(html);
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-2 z-[100] w-[1270px] max-w-[90vw] animate-in fade-in duration-200">
      <div className="w-full bg-card/95 backdrop-blur-2xl border border-border/50 rounded-3xl flex flex-col relative overflow-hidden text-card-foreground">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
          <h2 className="text-xl font-bold">Prompt editor</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-hidden grid grid-cols-1 md:grid-cols-5 gap-6 p-6 h-[600px] max-h-[70vh]">
          
          {/* Left Panel: Editor */}
          <div className="flex flex-col h-full overflow-hidden md:col-span-3 rounded-2xl border border-border/50 bg-background/50 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary transition-colors">
            <TiptapEditor 
              editorRef={modalEditorRef} 
              initialContent={initialContent} 
              className="h-full w-full !bg-transparent !border-none !rounded-none !min-h-0 [&_.ProseMirror]:min-h-full"
            />
          </div>

          {/* Right Panel: Chat / Assistant */}
          <div className="h-full flex flex-col border border-border/50 rounded-2xl bg-muted/20 overflow-hidden relative md:col-span-2">
            
            {/* Chat History or Empty State */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50">
              {chatHistory.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
                    <MessageSquareText className="w-6 h-6" />
                  </div>
                  <p className="text-sm">Ask me anything about your prompt</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`px-4 py-3 rounded-2xl text-sm max-w-[85%] ${ msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted/80 backdrop-blur-sm text-foreground border border-border/50 rounded-bl-sm prose prose-sm dark:prose-invert' }`}>
                        {msg.role === 'ai' ? (
                          <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  {isAiLoading && (
                    <div className="flex justify-start">
                      <div className="px-4 py-3 rounded-2xl text-sm bg-muted/80 backdrop-blur-sm text-foreground border border-border/50 rounded-bl-sm flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AI Controls */}
            <div className="p-4 bg-background/40 backdrop-blur-md border-t border-border/50 flex flex-col gap-3">
              <div className="relative flex items-center bg-background border border-input rounded-xl px-2 py-2 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary transition-all">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChat(); }}
                  placeholder="Make it more detailed, add lighting effects..."
                  className="flex-1 bg-transparent px-4 text-sm focus:outline-none text-foreground placeholder:text-muted-foreground"
                />
                <button 
                  onClick={handleChat}
                  disabled={isAiLoading || !chatInput.trim()}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${ chatInput.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground' }`}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 flex justify-end bg-background/40 backdrop-blur-md border-t border-border/50 rounded-b-3xl">
          <button 
            onClick={handleApply}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-300 active:scale-[0.98]"
          >
            Apply prompt
          </button>
        </div>

      </div>
    </div>
  );
}
