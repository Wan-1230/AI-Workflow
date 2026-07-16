// 手动下载 Electron 二进制文件
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const platform = process.platform
const arch = process.arch
const version = 'v33.2.0'
const mirror = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/'

const electronDir = path.dirname(require.resolve('electron/package.json'))
const distDir = path.join(electronDir, 'dist')
const zipName = `electron-${version}-${platform}-${arch}.zip`
const url = `${mirror}${version}/${zipName}`

console.log(`下载 Electron ${version}...`)
console.log(`从: ${url}`)
console.log(`到: ${distDir}`)

fs.mkdirSync(distDir, { recursive: true })
const zipPath = path.join(distDir, zipName)

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('重定向次数过多'))
    
    const file = fs.createWriteStream(dest)
    const proto = url.startsWith('https') ? https : http
    
    const req = proto.get(url, { rejectUnauthorized: false }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        fs.unlinkSync(dest)
        const newUrl = response.headers.location.startsWith('http')
          ? response.headers.location
          : new URL(response.headers.location, url).href
        console.log(`重定向到: ${newUrl}`)
        return download(newUrl, dest, redirects + 1).then(resolve).catch(reject)
      }

      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        return reject(new Error(`HTTP ${response.statusCode}`))
      }

      const total = parseInt(response.headers['content-length'], 10)
      let downloaded = 0

      response.on('data', (chunk) => {
        downloaded += chunk.length
        if (total) {
          const pct = ((downloaded / total) * 100).toFixed(1)
          const mb = (downloaded / 1024 / 1024).toFixed(1)
          const totalMb = (total / 1024 / 1024).toFixed(1)
          process.stdout.write(`\r  进度: ${pct}% (${mb} MB / ${totalMb} MB)`)
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        console.log('\n下载完成！')
        resolve()
      })
      file.on('error', reject)
    })

    req.on('error', reject)
    req.setTimeout(60000, () => {
      req.destroy()
      reject(new Error('下载超时 (60s)'))
    })
  })
}

async function main() {
  try {
    await download(url, zipPath)
    
    console.log('解压中...')
    const { execSync } = require('child_process')
    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${distDir}' -Force"`, { stdio: 'inherit' })
    
    fs.unlinkSync(zipPath)
    
    // 验证
    const exeName = platform === 'win32' ? 'electron.exe' : 'electron'
    const exePath = path.join(distDir, exeName)
    if (fs.existsSync(exePath)) {
      console.log(`✅ Electron 安装成功: ${exePath}`)
    } else {
      console.log(`⚠️  未找到 ${exeName}，请检查 dist 目录`)
    }
  } catch (err) {
    console.error('失败:', err.message)
    process.exit(1)
  }
}

main()
