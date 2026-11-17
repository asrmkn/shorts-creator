import fs from 'node:fs';

/** Minimal MP4/MOV inspector: reads only box headers and the (small) moov box, never the media data. */
export interface VideoInfo {
  durationSec: number;
  width: number;
  height: number;
  /** moov before mdat: required by Instagram, recommended for streaming. */
  faststart: boolean;
  videoCodec: string | null;
  hasAudio: boolean;
}

function readAt(fd: number, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, pos);
  return buf.subarray(0, n);
}

function* children(buf: Buffer, start: number, end: number): Generator<{ type: string; start: number; end: number }> {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(pos + 8));
      header = 16;
    } else if (size === 0) size = end - pos;
    if (size < header || pos + size > end) return;
    yield { type, start: pos + header, end: pos + size };
    pos += size;
  }
}

export function inspectVideo(filePath: string): VideoInfo {
  const fd = fs.openSync(filePath, 'r');
  try {
    const fileSize = fs.fstatSync(fd).size;
    let pos = 0;
    let moov: Buffer | null = null;
    let mdatSeen = false;
    let faststart = false;
    let sawFtyp = false;
    while (pos + 8 <= fileSize) {
      const h = readAt(fd, pos, 16);
      let size = h.readUInt32BE(0);
      const type = h.toString('latin1', 4, 8);
      if (size === 1) size = Number(h.readBigUInt64BE(8));
      else if (size === 0) size = fileSize - pos;
      if (size < 8) break;
      if (type === 'ftyp') sawFtyp = true;
      if (type === 'mdat') mdatSeen = true;
      if (type === 'moov') {
        if (size > 64 * 1024 * 1024) throw new Error('moov box is unexpectedly large');
        moov = readAt(fd, pos, size);
        faststart = !mdatSeen;
      }
      pos += size;
    }
    if (!sawFtyp || !moov) throw new Error('Not a valid MP4/MOV file (missing ftyp or moov box).');

    let durationSec = 0;
    let width = 0;
    let height = 0;
    let videoCodec: string | null = null;
    let hasAudio = false;
    for (const box of children(moov, 8, moov.length)) {
      if (box.type === 'mvhd') {
        const version = moov[box.start];
        const timescale = version === 1 ? moov.readUInt32BE(box.start + 20) : moov.readUInt32BE(box.start + 12);
        const duration = version === 1 ? Number(moov.readBigUInt64BE(box.start + 24)) : moov.readUInt32BE(box.start + 16);
        durationSec = timescale ? duration / timescale : 0;
      }
      if (box.type === 'trak') {
        let w = 0;
        let hgt = 0;
        let handler = '';
        let codec = '';
        const walk = (s: number, e: number) => {
          for (const b of children(moov!, s, e)) {
            if (b.type === 'tkhd') {
              const version = moov![b.start];
              const off = b.start + (version === 1 ? 88 : 76);
              w = moov!.readUInt32BE(off) / 65536;
              hgt = moov!.readUInt32BE(off + 4) / 65536;
              // Display matrix: a 90/270-degree rotation (a = 0, |b| = 1) swaps the displayed width and height.
              const m = b.start + (version === 1 ? 52 : 40);
              const a = moov!.readInt32BE(m) / 65536;
              const bb = moov!.readInt32BE(m + 4) / 65536;
              if (Math.abs(a) < 0.5 && Math.abs(bb) > 0.5) [w, hgt] = [hgt, w];
            } else if (b.type === 'hdlr') {
              handler = moov!.toString('latin1', b.start + 8, b.start + 12);
            } else if (b.type === 'stsd') {
              codec = moov!.toString('latin1', b.start + 12, b.start + 16);
            } else if (['mdia', 'minf', 'stbl'].includes(b.type)) {
              walk(b.start, b.end);
            }
          }
        };
        walk(box.start, box.end);
        if (handler === 'vide' && !videoCodec) {
          width = w;
          height = hgt;
          videoCodec = codec || null;
        }
        if (handler === 'soun') hasAudio = true;
      }
    }
    return { durationSec, width, height, faststart, videoCodec, hasAudio };
  } finally {
    fs.closeSync(fd);
  }
}

/** Problems that stop a file from being a YouTube Short (blocking) or an Instagram Reel (blocking when Instagram is selected). */
export function shortsProblems(info: VideoInfo, opts: { instagram?: boolean } = {}): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (info.durationSec > 180) blocking.push(`The video is ${Math.round(info.durationSec)} s; Shorts can be at most 3 minutes.`);
  if (info.width && info.height && info.width > info.height) blocking.push(`The video is landscape (${info.width}x${info.height}); Shorts must be vertical or square.`);
  if (info.durationSec > 60) warnings.push('Over 60 s: any Content ID claim will block the Short worldwide.');
  if (info.videoCodec && !/avc1|avc3|hvc1|hev1/.test(info.videoCodec)) warnings.push(`Video codec ${info.videoCodec} may be rejected by Instagram (use H.264).`);
  if (!info.faststart) {
    const msg = 'The moov atom is at the end of the file. Instagram needs a faststart export (ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4).';
    (opts.instagram ? blocking : warnings).push(msg);
  }
  if (!info.hasAudio) warnings.push('No audio track found.');
  return { blocking, warnings };
}
