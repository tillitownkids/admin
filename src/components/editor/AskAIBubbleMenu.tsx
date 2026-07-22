import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useState, useEffect, useRef } from 'react';
import { 
  Loader2, Sparkles, X, Check, ArrowUp,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link as LinkIcon
} from 'lucide-react';

interface AskAIBubbleMenuProps {
  editor: Editor;
}

export function AskAIBubbleMenu({ editor }: AskAIBubbleMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [userQuestion, setUserQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelectionUpdate = ({ editor: e }: { editor: Editor }) => {
      const { from, to } = e.state.selection;
      if (from === to && isOpen && !isLoading && !response) {
        handleClose();
      }
    };
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, isOpen, isLoading, response]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        if (!isLoading && !response) {
          handleClose();
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isLoading, response]);

  const handleAsk = async () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    
    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'ask',
          content: { selectedText, userQuestion }
        }),
      });

      if (!res.ok) throw new Error('Failed to ask AI');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResponse(data.result);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsert = () => {
    if (response) {
      const { to } = editor.state.selection;
      editor.chain().focus().insertContentAt(to, `\n\n${response}\n\n`).run();
      handleClose();
    }
  };

  const handleReplace = () => {
    if (response) {
      editor.chain().focus().insertContent(response).run();
      handleClose();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setUserQuestion('');
    setResponse(null);
    setError(null);
  };

  if (!editor) return null;

  const ToolbarButton = ({ onClick, isActive = false, disabled = false, icon: Icon, title }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${ isActive ? 'bg-primary/20 text-primary' : disabled ? 'opacity-50 cursor-not-allowed text-muted-foreground' : 'hover:bg-muted text-muted-foreground' }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <BubbleMenu 
      editor={editor} 
      shouldShow={(props: any) => {
        const { from, to } = props;
        return from !== to;
      }}
      className={`z-50 animate-in fade-in zoom-in-95 duration-200 ${ !isOpen ? 'bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl p-1.5 flex flex-col' : '' }`}
    >
      {!isOpen ? (
        <div className="flex items-center gap-1">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            icon={Bold}
            title="Bold"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            icon={Italic}
            title="Italic"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            icon={UnderlineIcon}
            title="Underline"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            icon={Strikethrough}
            title="Strikethrough"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
            icon={Code}
            title="Code"
          />
          <ToolbarButton
            onClick={() => {
              const previousUrl = editor.getAttributes('link').href;
              const url = window.prompt('Enter link URL', previousUrl);
              if (url === null) return;
              if (url === '') {
                editor.chain().focus().unsetLink().run();
                return;
              }
              editor.chain().focus().setLink({ href: url }).run();
            }}
            isActive={editor.isActive('link')}
            icon={LinkIcon}
            title="Link"
          />
          <div className="w-px h-5 bg-border/50 mx-1"></div>
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#8b5cf6]/10 text-[#8b5cf6] text-sm font-semibold transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Ask AI
          </button>
        </div>
      ) : (
        <div 
          ref={menuRef}
          className="w-[600px] max-w-[90vw] bg-background border border-[#8b5cf6] rounded-xl flex flex-col relative overflow-hidden transition-all duration-200"
        >
          {!response && !isLoading ? (
            <div className="relative w-full">
              <input
                type="text"
                autoFocus
                placeholder="Ask AI what you want..."
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(); }}
                className="w-full bg-transparent px-4 pt-4 pb-14 text-base focus:outline-none text-foreground placeholder:text-muted-foreground/70"
              />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <button className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-1">
                  <Sparkles className="w-4 h-4" />
                  Tone
                </button>
                <button
                  onClick={handleAsk}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${ userQuestion.trim() ? 'bg-[#8b5cf6] text-white hover:bg-[#7c3aed]' : 'bg-[#8b5cf6] text-white hover:bg-[#7c3aed]' }`}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
              AI is writing...
            </div>
          ) : error ? (
            <div className="p-4 flex items-start gap-2 text-destructive">
              <X className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4 p-4">
              <div className="max-h-[300px] overflow-y-auto prose prose-sm dark:prose-invert text-foreground">
                <div dangerouslySetInnerHTML={{ __html: response || '' }} />
              </div>
              <div className="flex gap-2 pt-2 border-t border-border/50">
                <button
                  onClick={handleReplace}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-semibold transition-colors"
                >
                  Replace
                </button>
                <button
                  onClick={handleInsert}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <Check className="w-4 h-4" /> Insert Below
                </button>
                <button
                  onClick={handleClose}
                  className="flex items-center justify-center p-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                  title="Discard"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </BubbleMenu>
  );
}
