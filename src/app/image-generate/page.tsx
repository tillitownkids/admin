// "use client"
// import { Bot } from "lucide-react";
// import { useEffect, useRef, useState } from "react";

// export default function(){
//     const [script,setScript] = useState("");

//     const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

//     function debouncedHandleChange(
//     e: React.ChangeEvent<HTMLTextAreaElement>
//     ) {
//     const value = e.target.value;

//     if (timeoutRef.current) {
//         clearTimeout(timeoutRef.current);
//     }

//     timeoutRef.current = setTimeout(() => {
//         setScript(value);
//     }, 100);
//     }
//     return(
//         <div className="w-full mx-auto space-y-8 page-enter pb-10">
//             <header className="space-y-3 flex items-start justify-between">
//                 <div className="flex items-center gap-3">
//                 <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary border border-primary/20">
//                     <Bot className="w-6 h-6" />
//                 </div>
//                 <div>
//                     <h1 className="text-3xl font-bold tracking-tight text-foreground font-heading">
//                     <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
//                         Image
//                     </span>{" "}
//                     Generation
//                     </h1>
//                     <p className="text-muted-foreground mt-1">
//                     Generate vibrant pictures tailored to your stories
//                     </p>
//                 </div>
//                 </div>
                
//             </header>
//             <div>
//                 <div>
//                     Drop your script here
//                 </div>
//                 <textarea onChange={debouncedHandleChange} className="border-2"></textarea>
//                 <div>
//                     {script}
//                 </div>
//             </div>
//         </div>
//     )
// }