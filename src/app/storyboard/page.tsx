"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const mock_stories = [
  {
    id: "story-1",
    title: "Episode 1 - Candy Forest",
  },
  {
    id: "story-2",
    title: "Episode 2 - Chocolate Cave",
  },
];

const mock_scripts = [
  {
    id: "script-1",
    storyId: "story-1",
    title: "Draft 1",
  },
  {
    id: "script-2",
    storyId: "story-1",
    title: "Final Script",
  },
  {
    id: "script-3",
    storyId: "story-2",
    title: "Final Script",
  },
];

const mock_prompts = [
  {
    scriptId: "script-1",
    text: `Create a rough storyboard for Episode 1.

Scene 1:
Bumble walks into the Candy Forest.

Scene 2:
The trees sparkle as magical candies fall from the sky.

Scene 3:
A wide cinematic shot of the forest with colorful creatures.`,
  },
  {
    scriptId: "script-2",
    text: `Generate a polished storyboard.

Scene 1:
Tilli enters the Candy Forest during sunrise.

Scene 2:
Bumble greets Tilli with excitement.

Scene 3:
Zap flies overhead leaving a glowing trail.

Scene 4:
Wide establishing shot of Candy Town.`,
  },
  {
    scriptId: "script-3",
    text: `Storyboard for Chocolate Cave.

Scene 1:
The heroes arrive outside the cave.

Scene 2:
Chocolate waterfalls illuminate the entrance.

Scene 3:
The team cautiously explores the cave while glowing crystals light the path.`,
  },
];

export default function StoryboardPage() {
  const [selectedStory, setSelectedStory] = useState("");
  const [selectedScript, setSelectedScript] = useState("");
  const [prompt, setPrompt] = useState("");
  const [imageCount, setImageCount] = useState(4);
  const [isLoading, setIsLoading] = useState(false);

  //database values
  const [scripts,setScripts] = useState();
  const [stories,setStories] = useState();

  const filteredScripts = mock_scripts.filter(
    (script) => script.storyId === selectedStory
  );

  useEffect(() => {
    if (filteredScripts.length > 0) {
      setSelectedScript(filteredScripts[0].id);
    } else {
      setSelectedScript("");
    }
  }, [selectedStory]);

  useEffect(() => {
    const promptData = mock_prompts.find(
      (prompt) => prompt.scriptId === selectedScript
    );

    setPrompt(promptData?.text ?? "");
  }, [selectedScript]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);

      console.log({
        storyId: selectedStory,
        scriptId: selectedScript,
        prompt,
        imageCount,
      });
    }, 1200);
  }

  useEffect(()=>{
    console.log({
      stories,scripts
    })
  },[stories])

  //database data fetch

  useEffect(()=>{
    async function main(){
      try{
        const scriptResponse = fetch("/api/scripts");
        const storyResponse = fetch("/api/stories");

        const [storyBuffer,scriptBuffer] = await Promise.all([storyResponse,scriptResponse]);
        const [story,script] = await Promise.all([storyBuffer.json(),scriptBuffer.json()]);

        setStories(story);
        setScripts(script);

      }catch(err){
        console.log("some error occurred")
      }
    }

    main();
  
  
  }
  ,[])

  return (
    <div className="w-full pl-6 pr-6 py-8 space-y-8 page-enter">
      <header className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <ImageIcon className="h-6 w-6" />
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Storyboard{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Generation
            </span>
          </h1>

          <p className="mt-1 text-muted-foreground">
            Generate storyboard images for your episodes.
          </p>
        </div>
      </header>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
      
          <div className="space-y-2">
            <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
              Story
            </label>
            <div className="relative">
              <select 
                value={selectedStory}
                onChange={(e) => {
                  if (!e.target.value) return;
  
                  setSelectedStory(e.target.value);
                  setSelectedScript("");
                  setPrompt("");
                }}
                className="w-full appearance-none bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer hover:bg-background text-foreground"
              > 
                <option value="">Select a story</option>

                {
                  mock_stories.map((story) => (
                    <option key={story.id} value={story.id}>{story.title}</option>
                  ))
                }
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
              </div>
            </div>
      
          </div>


          <div className="space-y-2">
            <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
              Script
            </label>
            <div className="relative">
              <select 
                value={selectedScript}
                disabled={!selectedStory}
                onChange={(e) => {
                  if (!e.target.value) return;
  
                  setSelectedScript(e.target.value);
                }}
                className="w-full appearance-none bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer hover:bg-background text-foreground"
              > 
                {/* <option value="">Select a script</option> */}
                {
                  filteredScripts.map((script) => (
                    <option key={script.id} value={script.id}>{script.title}</option>
                  ))
                }
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
              </div>
            </div>
      
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                Prompt
              </label>

              <span className="text-xs text-muted-foreground">
                Editable
              </span>
            </div>

            <textarea
              rows={10}
              value={prompt}
              disabled={!selectedScript}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Select a script to load its prompt..."
              className="min-h-[220px] w-full resize-y rounded-xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
            />
          </div>


          <div className="space-y-2">
            <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
              Number of Images
            </label>

            <input
              type="number"
              min={1}
              max={20}
              value={imageCount}
              onChange={(e) =>
                setImageCount(Number(e.target.value))
              }
              className="w-36 rounded-xl border bg-background px-4 py-2 outline-none transition focus:border-primary"
            />
          </div>

          <button
            type="submit"
            disabled={
              isLoading ||
              !selectedStory ||
              !selectedScript ||
              !prompt.trim()
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Storyboard...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Storyboard
              </>
            )}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">
            Generated Images
          </h2>

          <span className="text-sm text-muted-foreground">
            Images will appear here
          </span>
        </div>

        <div className="mt-6 flex h-72 items-center justify-center rounded-xl border border-dashed p-4">
          <div className="text-center">
            <ImageIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />

            <p className="font-medium">
              No images generated yet
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Select a story, script, edit the prompt and generate
              your storyboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}