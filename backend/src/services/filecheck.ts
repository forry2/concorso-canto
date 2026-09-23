/**
 * Controllo magic bytes per file audio/video.
 * Evita l'uso del pacchetto file-type (ESM-only nelle versioni recenti).
 * Legge i primi 12 byte del file e verifica le firme binarie.
 */

interface MagicCheck {
  mime: string;
  check: (b: Buffer) => boolean;
}

const MAGIC_CHECKS: MagicCheck[] = [
  // MP4 / M4A / M4V / MOV — 'ftyp' a offset 4
  {
    mime: 'video/mp4',
    check: (b) => b.length > 11 && b.slice(4, 8).toString('ascii') === 'ftyp',
  },
  // MP3 — tag ID3
  {
    mime: 'audio/mpeg',
    check: (b) => b.length > 2 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33,
  },
  // MP3 — sync bits MPEG (FF E*, FF F*, FF FA..FD)
  {
    mime: 'audio/mpeg',
    check: (b) =>
      b.length > 1 &&
      b[0] === 0xff &&
      (b[1] & 0xe0) === 0xe0 &&
      (b[1] & 0x18) !== 0x08,
  },
  // WAV — RIFF....WAVE
  {
    mime: 'audio/wav',
    check: (b) =>
      b.length > 11 &&
      b.slice(0, 4).toString('ascii') === 'RIFF' &&
      b.slice(8, 12).toString('ascii') === 'WAVE',
  },
  // AVI — RIFF....AVI (spazio incluso)
  {
    mime: 'video/x-msvideo',
    check: (b) =>
      b.length > 11 &&
      b.slice(0, 4).toString('ascii') === 'RIFF' &&
      b.slice(8, 12).toString('ascii') === 'AVI ',
  },
  // OGG / OGV
  {
    mime: 'audio/ogg',
    check: (b) =>
      b.length > 4 && b.slice(0, 4).toString('ascii') === 'OggS',
  },
  // FLAC
  {
    mime: 'audio/flac',
    check: (b) =>
      b.length > 4 && b.slice(0, 4).toString('ascii') === 'fLaC',
  },
  // WebM / MKV — EBML header
  {
    mime: 'video/webm',
    check: (b) =>
      b.length > 4 &&
      b[0] === 0x1a &&
      b[1] === 0x45 &&
      b[2] === 0xdf &&
      b[3] === 0xa3,
  },
  // WMV / WMA / ASF
  {
    mime: 'video/x-ms-wmv',
    check: (b) =>
      b.length > 4 &&
      b[0] === 0x30 &&
      b[1] === 0x26 &&
      b[2] === 0xb2 &&
      b[3] === 0x75,
  },
  // AAC (ADTS)
  {
    mime: 'audio/aac',
    check: (b) =>
      b.length > 1 &&
      b[0] === 0xff &&
      (b[1] === 0xf1 || b[1] === 0xf9),
  },
  // AIFF / AIFF-C
  {
    mime: 'audio/aiff',
    check: (b) =>
      b.length > 11 &&
      b.slice(0, 4).toString('ascii') === 'FORM' &&
      (b.slice(8, 12).toString('ascii') === 'AIFF' ||
        b.slice(8, 12).toString('ascii') === 'AIFC'),
  },
  // MPEG Video (.mpg/.mpeg)
  {
    mime: 'video/mpeg',
    check: (b) =>
      b.length > 3 &&
      b[0] === 0x00 &&
      b[1] === 0x00 &&
      b[2] === 0x01 &&
      (b[3] === 0xba || b[3] === 0xb3),
  },
];

/**
 * Controlla se il buffer corrisponde a un file audio o video legittimo.
 * @param buffer — almeno i primi 12 byte del file
 */
export function isAudioOrVideo(buffer: Buffer): { valid: boolean; mime?: string } {
  for (const { mime, check } of MAGIC_CHECKS) {
    if (check(buffer)) {
      return { valid: true, mime };
    }
  }
  return { valid: false };
}

/**
 * Legge i primi 12 byte da un file sul disco e ne verifica il tipo.
 */
export function checkFileOnDisk(filePath: string): { valid: boolean; mime?: string } {
  const fs = require('fs') as typeof import('fs');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  return isAudioOrVideo(buf);
}
