/**
 * A reply with a ```copy block (B-copie-1, E-16): the frame, its button, light
 * and dark, desk and phone. Read back from the store, so the reply is settled.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function scenario(bench) {
  const id = 'c0c0c0c0-0000-4000-8000-000000000016'
  const threads = await bench.threadsDir()
  const email = [
    'Bonjour Anne,',
    '',
    'Je confirme jeudi à 14 h. Le dossier complet est ici : https://exemple.test/dossiers/2026/baden/voyage-de-groupe/programme-detaille-version-finale',
    '',
    'Cordialement,',
    'Paul',
  ].join('\n')
  await writeFile(
    join(threads, `${id}.jsonl`),
    [
      { type: 'meta', id, title: 'Email à Anne', updatedAt: '2026-08-28T09:10:00.000Z' },
      { type: 'message', id: 'u1', role: 'user', text: "Reformule mon email à Anne.", at: '2026-08-28T09:10:00.000Z' },
      {
        type: 'message',
        id: 'a1',
        role: 'agent',
        text: `Voici une version plus claire :\n\n\`\`\`copy\n${email}\n\`\`\`\n\nJ'ai gardé le lien tel quel. Une variante courte :\n\n\`\`\`copy\nOK pour jeudi 14 h, Paul.\n\`\`\`\n\n\`\`\`sh\nnpm test\n\`\`\``,
        at: '2026-08-28T09:10:05.000Z',
      },
    ]
      .map(bench.line)
      .join(''),
  )

  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, tab: id })
    await bench.shoot(page, `1-desk-${theme}`)
    await page.getByRole('button', { name: 'Copy' }).first().click()
    await page.waitForTimeout(300)
    await bench.shoot(page, `2-copied-${theme}`)
  }
  for (const theme of ['light', 'dark']) {
    const phone = await bench.open({ theme, tab: id, width: 390, height: 844 })
    await bench.shoot(phone, `3-phone-${theme}`)
  }
}
