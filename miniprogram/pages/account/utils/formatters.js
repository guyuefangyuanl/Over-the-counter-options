exports.formatMoney = (v, mask=false) => {
  if (mask) return '****'
  const n = Number(v||0)
  if (Math.abs(n)>=10000) return (n/10000).toFixed(2)+'万'
  return n.toFixed(2)
}

exports.formatPercent = (v) => {
  const n = Number(v||0)
  const sign = n>0?'+':''
  return sign+n.toFixed(2)+'%'
}

exports.formatChange = (profit, base) => {
  const p = Number(profit||0)
  const b = Number(base||1)
  const rate = b? (p/b*100):0
  const sign = rate>0?'+':''
  return sign+rate.toFixed(2)+'%'
}
