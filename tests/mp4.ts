/** Builds a tiny but structurally valid MP4 (ftyp, moov with video and audio tracks, mdat) for tests. */
const box = (type: string, ...payload: Buffer[]) => {
  const body = Buffer.concat(payload);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};

export function makeMp4({ durationSec = 26, width = 1080, height = 1920, faststart = true, payload = 'frames', rotate90 = false } = {}): Buffer {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(Math.round(durationSec * 1000), 16);
  const tkhd = Buffer.alloc(84);
  // Display matrix (a, b, u, c, d, v, x, y, w): identity, or a 90-degree rotation.
  const matrix = rotate90 ? [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000] : [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
  matrix.forEach((v, i) => tkhd.writeInt32BE(v, 40 + i * 4));
  tkhd.writeUInt32BE(width * 65536, 76);
  tkhd.writeUInt32BE(height * 65536, 80);
  const hdlr = (t: string) => {
    const b = Buffer.alloc(24);
    b.write(t, 8, 'latin1');
    return box('hdlr', b);
  };
  const stsd = Buffer.alloc(16);
  stsd.writeUInt32BE(1, 4);
  stsd.writeUInt32BE(8, 8);
  stsd.write('avc1', 12, 'latin1');
  const video = box('trak', box('tkhd', tkhd), box('mdia', hdlr('vide'), box('minf', box('stbl', box('stsd', stsd)))));
  const audio = box('trak', box('mdia', hdlr('soun')));
  const moov = box('moov', box('mvhd', mvhd), video, audio);
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1'));
  const mdat = box('mdat', Buffer.from(payload));
  return faststart ? Buffer.concat([ftyp, moov, mdat]) : Buffer.concat([ftyp, mdat, moov]);
}
