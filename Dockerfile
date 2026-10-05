FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY mush ./mush
# mush/three.min.js is three@0.160.0 build/three.min.js (669884 bytes), byte-identical
# to the copy in KaiserAccount/mush. It is too large to push through the GitHub
# connector, so it is fetched at build time and checked by sha256. If the file is
# committed later, the fetch is skipped and only the checksum runs.
RUN node -e "const fs=require('fs'),c=require('crypto'),f='mush/three.min.js',w='170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa',urls=['https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js','https://unpkg.com/three@0.160.0/build/three.min.js'];const get=async()=>{if(fs.existsSync(f))return fs.readFileSync(f);for(const u of urls){try{const r=await fetch(u);if(r.ok)return Buffer.from(await r.arrayBuffer());}catch(e){}}throw new Error('three.min.js fetch failed');};get().then((b)=>{const h=c.createHash('sha256').update(b).digest('hex');if(h!==w)throw new Error('three.min.js sha256 '+h);fs.writeFileSync(f,b);console.log('three.min.js ok');}).catch((e)=>{console.error(e.message);process.exit(1);})"
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
