import io, re
NL = '\r\n'
def load(p):
    raw=io.open(p,encoding='utf-8',newline='').read()
    return raw, ('\r\n' if '\r\n' in raw else '\n')

p='electron/engine/storage/index.ts'
raw,nl=load(p)
old = nl.join(["    this.db = new Database(resolvedPath)","",
               "    // 启用 WAL 模式提升并发性能","    this.db.pragma('journal_mode = WAL')"])
assert raw.count(old)==1
raw=raw.replace(old, "    this.db = openStore('executions', resolvedPath)")
m=re.search(r"^import .*better-sqlite3.*$", raw, re.M)
raw = raw[:m.end()] + nl + "import { openStore } from './connection'" + raw[m.end():]
io.open(p,'w',encoding='utf-8',newline='').write(raw)

p='electron/engine/storage/credentials.ts'
raw,nl=load(p)
old = nl.join(["    this.db = new Database(resolvedPath)","    this.db.pragma('journal_mode = WAL')"])
assert raw.count(old)==1
raw=raw.replace(old, "    this.db = openStore('credentials', resolvedPath)")
m=re.search(r"^import .*better-sqlite3.*$", raw, re.M)
raw = raw[:m.end()] + nl + "import { openStore } from './connection'" + raw[m.end():]
io.open(p,'w',encoding='utf-8',newline='').write(raw)

p='electron/engine/storage/models.ts'
raw,nl=load(p)
old = nl.join([
"  setDefault(id: string): boolean {",
"    if (!this.getConfig(id)) return false",
"    this.clearDefault()",
"    this.db.prepare('UPDATE models SET is_default = 1, updated_at = ? WHERE id = ?')",
"      .run(new Date().toISOString(), id)",
"    return true",
"  },"])
new = nl.join([
"  setDefault(id: string): boolean {",
"    if (!this.getConfig(id)) return false",
"    // 清掉旧默认与设新默认之间若失败，库里会一个默认都没有；两步必须同事务",
"    this.db.transaction(() => {",
"      this.clearDefault()",
"      this.db.prepare('UPDATE models SET is_default = 1, updated_at = ? WHERE id = ?')",
"        .run(new Date().toISOString(), id)",
"    })()",
"    return true",
"  },"])
assert raw.count(old)==1
io.open(p,'w',encoding='utf-8',newline='').write(raw.replace(old,new))
print('ok')
