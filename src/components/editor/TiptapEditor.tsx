'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import { 
  Bot, Sparkles, Loader2, Check, X,
  Bold, Italic, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote,
  Undo, Redo, Plus, AlignLeft,
  Minus, CheckSquare, Code, Terminal, Image as ImageIcon, Link as LinkIcon
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AskAIBubbleMenu } from './AskAIBubbleMenu';

interface TiptapEditorProps {
  editorRef?: React.MutableRefObject<any>;
  initialContent?: string;
  className?: string;
}

export function TiptapEditor({ editorRef, initialContent, className = '' }: TiptapEditorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Type '/' for commands or start writing...",
        emptyEditorClass: 'is-editor-empty',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Image,
      Underline
    ],
    content: initialContent || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base dark:prose-invert focus:outline-none max-w-none min-h-[300px] p-6 sm:p-10 tiptap',
      },
    },
  });

  useEffect(() => {
    if (editor && editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  if (!editor) {
    return null;
  }

  const handleBrainstorm = async () => {
    setIsLoading(true);
    setError(null);
    setIdeas([]);

    try {
      const { from, to } = editor.state.selection;
      let textToBrainstorm = '';
      
      if (from !== to) {
        textToBrainstorm = editor.state.doc.textBetween(from, to, ' ');
      } else {
        textToBrainstorm = editor.getText();
      }

      if (!textToBrainstorm.trim()) {
        textToBrainstorm = "A magical adventure in TilliTown";
      }

      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'brainstorm', content: textToBrainstorm }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch ideas');
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setIdeas(data.result || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong');
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const insertIdea = (idea: string) => {
    editor.chain().focus().insertContent(`\n${idea}\n`).run();
    setIdeas([]);
  };

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
    <div className={`bg-card/40 backdrop-blur-2xl border border-border/50 rounded-3xl overflow-hidden relative flex flex-col min-h-[400px] ${className}`}>
      
      {/* Editor Content */}
      <div className="flex-1 relative cursor-text text-foreground overflow-y-auto">
        
        {/* Floating Menu for Blocks (Notion style '+') */}
        <FloatingMenu editor={editor} className="flex items-center gap-1 bg-background/95 backdrop-blur-xl border border-border/50 p-1.5 rounded-xl animate-in fade-in zoom-in-95 duration-200">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            icon={Heading1}
            title="Heading 1"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            icon={Heading2}
            title="Heading 2"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            icon={List}
            title="Bullet List"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            isActive={editor.isActive('taskList')}
            icon={CheckSquare}
            title="To-Do List"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            icon={Quote}
            title="Blockquote"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive('codeBlock')}
            icon={Terminal}
            title="Code Block"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            icon={Minus}
            title="Divider"
          />
          <ToolbarButton
            onClick={() => {
              const url = window.prompt('Enter image URL');
              if (url) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            }}
            icon={ImageIcon}
            title="Image"
          />
          <div className="w-px h-5 bg-border/50 mx-1"></div>
          <button
            onClick={handleBrainstorm}
            disabled={isLoading}
            className="p-1.5 flex items-center gap-1 rounded-lg hover:bg-primary/10 text-primary font-medium text-xs transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI
          </button>
        </FloatingMenu>

        <EditorContent editor={editor} />
        
        <AskAIBubbleMenu editor={editor} />

        {/* Error Toast */}
        {error && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2 rounded-full text-sm flex items-center gap-2 animate-in slide-in-from-bottom-2">
            <X className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* Ideas Panel */}
      {ideas.length > 0 && (
        <div className="absolute bottom-4 right-4 w-80 max-h-[400px] overflow-y-auto bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl z-40 p-4 animate-in slide-in-from-right-4">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/30">
            <h4 className="font-bold text-sm flex items-center gap-2 text-primary">
              <Sparkles className="w-4 h-4" /> AI Ideas
            </h4>
            <button 
              onClick={() => setIdeas([])}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-3">
            {ideas.map((idea, index) => (
              <div key={index} className="bg-muted/30 p-3 rounded-xl border border-border/30 hover:border-primary/30 transition-colors group">
                <p className="text-sm text-foreground/80 mb-3">{idea}</p>
                <button 
                  onClick={() => insertIdea(idea)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground rounded-lg text-xs font-semibold transition-colors"
                >
                  <Check className="w-3 h-3" /> Insert Idea
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
