import {MousePointerClick} from 'lucide-react';

const numberFormat=new Intl.NumberFormat('th-TH');
export function UsageCount({count}:{count?:number}) {
  return <span className="usage-count" aria-label={count===undefined?'ยังไม่มีข้อมูลจำนวนการเข้าใช้':`เข้าใช้ ${numberFormat.format(count)} ครั้ง`}>
    <MousePointerClick size={15} aria-hidden="true"/>
    {count===undefined?'เข้าใช้ — ครั้ง':`เข้าใช้ ${numberFormat.format(count)} ครั้ง`}
  </span>;
}
