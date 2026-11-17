import PDFDocument from 'pdfkit';
import type { Character, DayPlan, Scene, Settings } from '../shared/schemas';
import { buildFlowPrompt, promptNameOf } from '../shared/flowPrompt';
import { formatInTz, publishInstant } from '../shared/regional';

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const castNames = (d: DayPlan, characters: Character[]) =>
  d.characterIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c)
    .map(promptNameOf)
    .join(' & ');

export function monthToCsv(days: DayPlan[], characters: Character[], scenes: Scene[], settings: Settings): string {
  const header = ['Date', 'Theme', 'Series', 'Episode', 'Status', 'Concept', 'Cast', 'Scene', 'Hook text', 'CTA', 'Title', 'Hashtags', 'Publish (UTC)', 'Publish (your time)', 'Flow prompts'];
  const rows = days.map((d) => {
    const scene = scenes.find((s) => s.id === d.sceneId);
    const slot = publishInstant(d.date, settings.publishSlotUtc);
    return [
      d.date,
      d.theme,
      d.series,
      d.episode || '',
      d.status,
      d.concept,
      castNames(d, characters),
      scene?.name ?? '',
      d.pack?.hookText ?? '',
      d.pack?.clips.at(-1)?.lines[0]?.text ?? '',
      d.pack?.metadata.title ?? '',
      d.pack?.metadata.hashtags.join(' ') ?? '',
      slot.toISOString().slice(0, 16).replace('T', ' '),
      formatInTz(slot, settings.userTimezone),
      buildFlowPrompt(d, characters, scene, settings.targetModel, settings.characterMode)?.fullText ?? '',
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// PDFKit's built-in fonts only support WinAnsi; strip emoji and other unsupported glyphs.
const pdfSafe = (s: string) => s.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g, '');

export function monthToPdf(title: string, days: DayPlan[], characters: Character[], scenes: Scene[], settings: Settings): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.fontSize(20).text(pdfSafe(title)).moveDown(0.3);
  doc.fontSize(10).fillColor('#555').text(pdfSafe(`${settings.channelName} · daily publish at ${settings.publishSlotUtc} UTC · times shown in ${settings.userTimezone}`)).fillColor('#000');
  doc.moveDown();
  for (const d of days) {
    const scene = scenes.find((s) => s.id === d.sceneId);
    if (doc.y > 680) doc.addPage();
    doc.fontSize(13).text(pdfSafe(`${d.date} · ${d.theme}${d.series ? ` · ${d.series} Ep ${d.episode}` : ''}`), { underline: true });
    doc.fontSize(10).text(pdfSafe(`Concept: ${d.concept}`));
    doc.text(pdfSafe(`Cast: ${castNames(d, characters)} · Scene: ${scene?.name ?? '-'} · Status: ${d.status}`));
    doc.text(pdfSafe(`Publish: ${formatInTz(publishInstant(d.date, settings.publishSlotUtc), settings.userTimezone)} (your time)`));
    if (d.pack) {
      const m = d.pack.metadata;
      doc.text(pdfSafe(`Title: ${m.title}`));
      doc.text(pdfSafe(`Hook: ${d.pack.hookText} (${d.pack.hookVisual})`));
      d.pack.clips.forEach((c, i) =>
        doc.text(pdfSafe(`Clip ${i + 1} ${c.beat} (${c.durationSec}s): ${c.action}${c.lines.length ? ` ${c.lines.map((l) => `${l.speaker}: ${l.text}`).join(' / ')}` : ''}`), { indent: 10 }),
      );
      doc.text(pdfSafe(`Hashtags: ${m.hashtags.join(' ')}`));
      if (m.pinnedComment) doc.text(pdfSafe(`Pinned comment: ${m.pinnedComment}`));
    } else {
      doc.fillColor('#888').text('Prompt pack not generated yet.').fillColor('#000');
    }
    doc.moveDown();
  }
  doc.end();
  return doc;
}
