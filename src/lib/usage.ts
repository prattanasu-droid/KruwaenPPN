/** Unknown counts remain unknown rather than appearing as a successful zero. */
export function usageCount(value:unknown):number|undefined {
  if(typeof value!=='number'&&typeof value!=='string')return undefined;
  if(typeof value==='string'&&!/^\d+$/.test(value))return undefined;
  const count=Number(value);
  return Number.isSafeInteger(count)&&count>=0?count:undefined;
}
