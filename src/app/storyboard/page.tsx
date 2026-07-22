import { LayoutTemplate, Plus, MoreHorizontal, Image as ImageIcon } from "lucide-react";

export default function StoryboardPage() {
  const frames = [
    { id: 1, scene: "Ext. Candy Forest - Day", description: "Tilli walks into the vibrant candy forest. Camera pans wide." },
    { id: 2, scene: "Int. Chocolate Cave - Day", description: "Close up on Tilli's amazed expression as she sees the chocolate waterfall." },
    { id: 3, scene: "Ext. Marshmallow Meadows - Day", description: "Tilli meets the marshmallow bunnies. Wide shot." },
  ];

  return (
    <div className="max-w-6xl w-full mx-auto space-y-8 page-enter pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary border border-primary/20">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-heading">
              Storyboard <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">Editor</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Visualize and arrange scenes for your episodes.
            </p>
          </div>
        </div>
        <button className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-300 active:scale-[0.98]">
          <Plus className="w-5 h-5" /> New Storyboard
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {frames.map((frame) => (
          <div key={frame.id} className="group bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl overflow-hidden hover:border-primary/30 transition-all duration-400 flex flex-col">
            <div className="relative h-48 bg-muted/30 border-b border-border/50 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <LayoutTemplate className="w-16 h-16 text-muted-foreground/20 group-hover:scale-110 group-hover:text-primary/20 transition-all duration-500" />
              <span className="absolute font-medium text-muted-foreground/40 text-sm tracking-widest uppercase">Scene Sketch</span>
            </div>
            
            <div className="p-6 flex-1 flex flex-col relative">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-xs font-bold tracking-wide border border-primary/10">
                  Frame {frame.id}
                </div>
                <button className="text-muted-foreground hover:text-foreground hover:bg-muted p-1.5 rounded-md transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
              <h4 className="text-lg font-bold mb-2 text-foreground group-hover:text-primary transition-colors duration-300">
                {frame.scene}
              </h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {frame.description}
              </p>
            </div>
          </div>
        ))}
        
        <div className="group border-2 border-dashed border-border/60 hover:border-primary/50 bg-transparent hover:bg-primary/5 rounded-3xl h-full min-h-[350px] flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-semibold text-muted-foreground group-hover:text-primary transition-colors duration-300">
            Add New Frame
          </span>
        </div>
      </div>
    </div>
  );
}
