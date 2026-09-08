from pathlib import Path

check = Path('scripts/check-v3.mjs')
s = check.read_text()
old = '"articleLink","video","image","coverMeta"'
new = '"articleLink","video","image","table","coverMeta"'
if old not in s:
    raise SystemExit('check-v3 allowed block list drifted')
s = s.replace(old, new, 1)
anchor = '''    if (block.type === "toc") for (const item of block.items || []) if (!Number.isInteger(item.page) || item.page < 1 || item.page > issue.pages.length) fail(`${at}: 目录页码 ${item.page} 越界`);\n'''
insert = anchor + '''    if (block.type === "table") {\n      const rows=block.rows;\n      if(!Array.isArray(rows)||rows.length<1||rows.length>40) fail(`${at}: table.rows 必须为 1–40 行`);\n      else {\n        let width=null;\n        rows.forEach((row,ri)=>{\n          if(!Array.isArray(row)||row.length<1||row.length>12) return fail(`${at}: table.rows[${ri}] 必须为 1–12 列`);\n          if(width==null)width=row.length;else if(row.length!==width)fail(`${at}: table.rows[${ri}] 列数 ${row.length} 与首行 ${width} 不一致`);\n          row.forEach((cell,ci)=>{if(typeof cell!=="string"&&typeof cell!=="number")fail(`${at}: table.rows[${ri}][${ci}] 必须为文本或数字`);});\n        });\n      }\n      const headerRows=Number(block.headerRows||0);\n      if(!Number.isInteger(headerRows)||headerRows<0||headerRows>(Array.isArray(rows)?rows.length:0)) fail(`${at}: table.headerRows 必须在 0–行数之间`);\n      if(String(block.caption||'').length>500) fail(`${at}: table.caption 超过 500 个字符`);\n    }\n'''
if anchor not in s:
    raise SystemExit('check-v3 validation anchor drifted')
s = s.replace(anchor, insert, 1)
check.write_text(s)

lib = Path('scripts/lib-v3-production.mjs')
t = lib.read_text()
anchor2 = "    case 'image': return block.caption || '';\n"
insert2 = anchor2 + "    case 'table': return [block.caption, ...(block.rows || []).flatMap(row => (row || []).map(cell => String(cell ?? '')))].filter(Boolean).join('。');\n"
if anchor2 not in t:
    raise SystemExit('lib-v3-production narration anchor drifted')
t = t.replace(anchor2, insert2, 1)
lib.write_text(t)
print('P1-08 table production alignment applied')
