import type { PriceResult } from "~/lib/pricing-engine";

export const CPG_GRADES = ["VG8","F15","VF30","XF45","AU55","AU58","CU60","CU63","CU64","GEM65","GEM66","GEM67","GEM68","GEM69","GEM70"];
export const LOW_GRADES = CPG_GRADES.slice(0, 5);
export const MID_GRADES = CPG_GRADES.slice(5, 10);
export const HIGH_GRADES = CPG_GRADES.slice(10);
export function normalizeGrade(grade: string): string { return grade.replace(/[\s\-_]/g, "").toUpperCase(); }
export function buildGradeRetailMap(sales: PriceResult["recent_sales"]): Map<string, number> {
  const map = new Map<string, number>();
  for (const sale of sales) if (sale.source?.toLowerCase().includes("cpg")) { const g=normalizeGrade(sale.grade); if (!map.has(g)) map.set(g,sale.price); }
  for (const sale of sales) { const s=sale.source?.toLowerCase()||"", g=normalizeGrade(sale.grade); if (!map.has(g) && (s.includes("greensheet")||s.includes("cpg"))) map.set(g,sale.price); }
  return map;
}
export function averageForGrades(map: Map<string, number>, grades: string[]): number | null {
  const values=grades.map(g=>map.get(normalizeGrade(g))).filter((v): v is number=>v !== undefined && v > 0);
  return values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length*100)/100 : null;
}
export function gradeBreakdown(result: PriceResult) {
  const map=buildGradeRetailMap(result.recent_sales);
  return { map, rows: CPG_GRADES.map(grade=>({grade,retail:map.get(normalizeGrade(grade))??0})).filter(r=>r.retail>0), lowAvg:averageForGrades(map,LOW_GRADES), midAvg:averageForGrades(map,MID_GRADES), highAvg:averageForGrades(map,HIGH_GRADES) };
}
