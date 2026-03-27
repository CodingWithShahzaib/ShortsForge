"use client";

 import Link from "next/link";
 import { motion } from "framer-motion";
 import { ArrowRight, Sparkles } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { cn } from "@/lib/utils";

 export type NextActionItem = {
   id: string;
   title: string;
   description: string;
   ctaLabel: string;
   href: string;
 };

 export function NextActionPanel({
   items,
   className,
 }: {
   items: NextActionItem[];
   className?: string;
 }) {
   return (
     <motion.section
       initial={{ opacity: 0, y: 6 }}
       animate={{ opacity: 1, y: 0 }}
       transition={{ duration: 0.3 }}
       className={cn(
        "rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/75",
         className
       )}
       aria-labelledby="next-actions-heading"
     >
       <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500/20 via-sky-500/10 to-transparent text-cyan-600 dark:from-cyan-500/20 dark:text-cyan-300">
           <Sparkles className="h-4 w-4" />
         </span>
         <div>
           <h2 id="next-actions-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
             Next best actions
           </h2>
           <p className="text-[11px] text-slate-500 dark:text-slate-400">
             Keep your pipeline moving with the highest-impact steps.
           </p>
         </div>
       </div>

       <div className="mt-4 space-y-3">
         {items.map((item) => (
           <div
             key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2.5 transition hover:border-cyan-300/60 hover:bg-cyan-50/40 dark:border-zinc-700/70 dark:bg-zinc-800/40 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10"
           >
             <div className="min-w-0">
               <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
               <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.description}</p>
             </div>
             <Button asChild size="sm" className="shrink-0 gap-1 rounded-lg">
               <Link href={item.href}>
                 {item.ctaLabel}
                 <ArrowRight className="h-3.5 w-3.5" />
               </Link>
             </Button>
           </div>
         ))}
       </div>
     </motion.section>
   );
 }
