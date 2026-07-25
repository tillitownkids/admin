'use client';

import { Users, Type } from "lucide-react";
import { useState, useEffect } from "react";
import { labelClass, selectFieldClass } from "@/lib/styles";

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
    <div className="bg-card text-card-foreground rounded-xl border border-border flex flex-col h-fit">
      <div className="p-5 border-b border-border">
        <h2 className="text-lg font-semibold tracking-tight">Global Story Settings</h2>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <label className={labelClass}>
            <Users className="w-4 h-4 text-primary" />
            Target Audience
          </label>
          <div className="relative">
            <select
              value={audience}
              onChange={(e) => handleAudienceChange(e.target.value)}
              className={selectFieldClass}
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
          <label className={labelClass}>
            <Type className="w-4 h-4 text-primary" />
            Tone
          </label>
          <div className="relative">
            <select
              value={tone}
              onChange={(e) => handleToneChange(e.target.value)}
              className={selectFieldClass}
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
