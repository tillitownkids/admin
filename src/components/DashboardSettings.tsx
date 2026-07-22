'use client';

import { Users, Type } from "lucide-react";
import { useState, useEffect } from "react";

export function DashboardSettings() {
  const [audience, setAudience] = useState('kids');
  const [tone, setTone] = useState('educational');

  useEffect(() => {
    const savedAudience = localStorage.getItem('targetAudience');
    const savedTone = localStorage.getItem('tone');
    if (savedAudience) setAudience(savedAudience);
    if (savedTone) setTone(savedTone);
  }, []);

  const handleAudienceChange = (val: string) => {
    setAudience(val);
    localStorage.setItem('targetAudience', val);
  };

  const handleToneChange = (val: string) => {
    setTone(val);
    localStorage.setItem('tone', val);
  };

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border flex flex-col mt-6 h-fit">
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold tracking-tight">Global Story Settings</h2>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Target Audience
          </label>
          <div className="relative">
            <select 
              value={audience}
              onChange={(e) => handleAudienceChange(e.target.value)}
              className="w-full appearance-none bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer hover:bg-background text-foreground"
            >
              <option value="kids">Kids (4-8 years)</option>
              <option value="preteens">Pre-teens (9-12 years)</option>
              <option value="teens">Teens (13-17 years)</option>
              <option value="general">General Audience</option>
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
            <Type className="w-4 h-4 text-primary" />
            Tone
          </label>
          <div className="relative">
            <select 
              value={tone}
              onChange={(e) => handleToneChange(e.target.value)}
              className="w-full appearance-none bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer hover:bg-background text-foreground"
            >
              <option value="educational">Educational & Fun</option>
              <option value="adventurous">Adventurous</option>
              <option value="humorous">Humorous</option>
              <option value="emotional">Emotional & Heartwarming</option>
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
