import {Eye} from 'lucide-react';

const numberFormat=new Intl.NumberFormat('th-TH');
export function UsageCount({count}:{count?:number}) {
  return <span className="usage-count" aria-label={count===undefined?'ยังไม่มีข้อมูลจำนวนการเปิดสื่อ':`เปิดสื่อ ${numberFormat.format(count)} ครั้ง`}>
    <Eye size={15} aria-hidden="true"/>
    {count===undefined?'—':numberFormat.format(count)}
  </span>;
}
