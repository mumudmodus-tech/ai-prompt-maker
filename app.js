const $ = id => document.getElementById(id);
let favorites = load();
let timer;
let localGenerator = null;
let modelLoading = false;

function load() { try { return JSON.parse(localStorage.getItem('mmd-prompt-favorites') || '[]'); } catch { return []; } }
function save() { try { localStorage.setItem('mmd-prompt-favorites', JSON.stringify(favorites)); } catch { toast('Penyimpanan browser tidak tersedia.'); } }
function toast(s) { $('toast').textContent = s; $('toast').classList.add('show'); clearTimeout(timer); timer = setTimeout(() => $('toast').classList.remove('show'), 2600); }
function getFormData() {
  return {
    goal: $('goal').value.trim(), category: $('category').value, tool: $('tool').value,
    language: $('language').value, style: $('style').value,
    detail: document.querySelector('[name=detail]:checked').value,
    context: $('context').value.trim()
  };
}
function buildInstructions(d) {
  const lang = d.language === 'Inggris' ? 'English' : 'Bahasa Indonesia';
  const detail = d.detail === 'Ringkas' ? 'Buat ringkas dan langsung ke inti.' : d.detail === 'Mendalam' ? 'Buat rinci, terstruktur, dan sertakan contoh yang konkret.' : 'Buat seimbang: jelas, praktis, dan cukup terperinci.';
  return `Kamu adalah ahli prompt engineering yang membantu pengguna menyusun prompt berkualitas tinggi. Tulis HANYA prompt final yang siap disalin, bukan penjelasan tentang prompt. Gunakan bahasa ${lang}.\n\nTujuan pengguna: ${d.goal}\nKategori: ${d.category}\nAI tujuan: ${d.tool}\nGaya: ${d.style}\nTingkat detail: ${d.detail} — ${detail}\nKonteks tambahan: ${d.context || 'Belum diberikan. Jangan mengarang fakta; minta AI tujuan menyatakan asumsi atau mengajukan pertanyaan bila informasi penting kurang.'}\n\nBuat prompt profesional yang mencakup peran yang relevan, tujuan spesifik, konteks, langkah kerja yang masuk akal, batasan, format keluaran, dan kriteria kualitas. Sesuaikan dengan kategori dan hindari klaim yang tidak berdasar. Pastikan prompt praktis, tidak bertele-tele, dan langsung dapat digunakan.`;
}
function generateTemplate(d) {
  const en = d.language === 'Inggris';
  const t = (id, enText) => en ? enText : id;
  const detail = d.detail === 'Ringkas' ? t('Buat jawaban ringkas, jelas, dan fokus pada langkah terpenting.', 'Keep the answer concise, clear, and focused on the most important actions.') : d.detail === 'Mendalam' ? t('Berikan jawaban mendalam, bertahap, disertai contoh, rekomendasi praktis, serta kesalahan umum yang perlu dihindari.', 'Provide a thorough, step-by-step answer with examples, practical recommendations, and common mistakes to avoid.') : t('Seimbangkan detail dengan kejelasan. Gunakan bagian terstruktur dan contoh praktis bila membantu.', 'Balance useful detail with clarity. Use structured sections and practical examples where helpful.');
  return [t('Bertindaklah sebagai ahli yang kompeten dan relevan dengan tugas ini.', 'Act as a skilled specialist relevant to this task') + ' ' + t('Gunakan gaya komunikasi ', 'Use a ') + d.style + '.', '', t('TUGAS / TUJUAN', 'TASK / OBJECTIVE') + ':', d.goal, '', t('KONTEKS', 'CONTEXT') + ':', t('Kategori: ', 'Category: ') + d.category + '. ' + (d.context || t('Jika informasi penting belum tersedia, sebutkan asumsi atau ajukan pertanyaan klarifikasi singkat.', 'If essential information is missing, state assumptions or ask concise clarifying questions.')), '', t('PENDEKATAN', 'APPROACH') + ':', detail + ' ' + t('Utamakan ketepatan, kegunaan, dan langkah konkret.', 'Prioritize accuracy, usefulness, and concrete next steps.'), '', t('KETENTUAN HASIL', 'OUTPUT REQUIREMENTS') + ':', t('Gunakan judul bagian yang jelas, format mudah dibaca, dan bahasa yang sesuai dengan audiens. Hindari klaim yang tidak berdasar.', 'Use clear headings, readable formatting, and audience-appropriate language. Avoid unsupported claims.'), '', t('PEMERIKSAAN KUALITAS', 'QUALITY CHECK') + ':', t('Pastikan hasil menjawab tujuan, mengikuti batasan, dan menjelaskan ketidakpastian bila ada.', 'Check that the result meets the objective, follows constraints, and identifies uncertainty.'), '', t('AI tujuan: ', 'Target AI: ') + d.tool + '.', t('Mulai sekarang dan berikan hasil yang diminta.', 'Start now and provide the requested result.')].join('\n');
}
function showResult(text, d, source) {
  $('result').value = text.trim();
  $('result-section').hidden = false;
  $('copy-status').textContent = source === 'ai' ? 'Dihasilkan oleh model AI lokal di browser.' : 'Prompt template siap digunakan.';
  wordCount();
  $('result-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function wordCount() { const s = $('result').value.trim(); $('word-count').textContent = (s ? s.split(/\s+/).length : 0) + ' kata'; }

// Adds a clearly labelled optional local-AI control without requiring edits to index.html.
const form = $('prompt-form');
const aiBox = document.createElement('div');
aiBox.className = 'local-ai-box';
aiBox.style.cssText = 'margin-top:12px;padding:14px;border:1px solid #cbd8f6;border-radius:14px;background:#f5f8ff;color:#17336e';
aiBox.innerHTML = '<div style="font-weight:700;margin-bottom:5px">✦ AI lokal (beta)</div><p style="margin:0 0 10px;font-size:13px;line-height:1.5">Mencoba model bahasa kecil langsung di browser. Gratis dan tanpa API key. Unduhan model pertama bisa besar dan membutuhkan internet.</p><button type="button" id="local-ai-btn" class="secondary" style="width:100%">Buat dengan AI lokal</button><div id="local-ai-status" role="status" style="font-size:12px;margin-top:8px;line-height:1.5">Belum dimuat · Model: Qwen2.5 0.5B (kuantisasi q4)</div>';
form.appendChild(aiBox);

$('local-ai-btn').addEventListener('click', async () => {
  const d = getFormData();
  if (!d.goal) { $('goal').focus(); toast('Isi tujuan terlebih dahulu.'); return; }
  if (modelLoading) return;
  const btn = $('local-ai-btn'); const status = $('local-ai-status');
  modelLoading = true; btn.disabled = true;
  try {
    if (!localGenerator) {
      status.textContent = 'Memuat pustaka AI dan mengunduh model. Tetap buka halaman ini; proses pertama mungkin lama.';
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      env.allowLocalModels = false;
      localGenerator = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
        dtype: 'q4',
        progress_callback: p => {
          if (p && p.status === 'progress' && Number.isFinite(p.progress)) status.textContent = `Mengunduh model AI: ${Math.round(p.progress)}%`;
          else if (p && p.status === 'initiate') status.textContent = 'Menyiapkan file model AI lokal…';
        }
      });
    }
    status.textContent = 'Model siap. AI sedang menyusun prompt…';
    btn.textContent = 'AI sedang bekerja…';
    const messages = [
      { role: 'system', content: 'You are an expert prompt engineer. Generate a polished, useful prompt. Follow the requested output language. Return only the final prompt, with no commentary.' },
      { role: 'user', content: buildInstructions(d) }
    ];
    const output = await localGenerator(messages, { max_new_tokens: d.detail === 'Mendalam' ? 320 : 220, do_sample: true, temperature: 0.65, repetition_penalty: 1.08 });
    let generated = output?.[0]?.generated_text;
    if (Array.isArray(generated)) generated = generated.filter(m => m.role === 'assistant').map(m => m.content).join('\n');
    if (typeof generated !== 'string' || !generated.trim()) throw new Error('Model tidak mengembalikan teks.');
    // Defensive cleanup for models that echo the prompt.
    generated = generated.replace(/^\s*(assistant|prompt final)\s*[:\n-]*/i, '').trim();
    showResult(generated, d, 'ai');
    status.textContent = 'AI lokal aktif. Model berjalan di browser; hasil dapat perlu diperiksa ulang.';
    btn.textContent = 'Buat lagi dengan AI lokal';
    toast('Prompt dibuat oleh AI lokal. Periksa hasilnya sebelum digunakan.');
  } catch (err) {
    console.error('Local AI error:', err);

const detail = err instanceof Error
  ? err.message
  : String(err);

status.textContent =
  `AI lokal gagal: ${detail.slice(0, 180)}. ` +
  'Tombol “Buat prompt” tetap tersedia.';

toast(`AI lokal gagal: ${detail.slice(0, 90)}`);
  } finally {
    modelLoading = false; btn.disabled = false;
    if (btn.textContent === 'AI sedang bekerja…') btn.textContent = 'Coba lagi dengan AI lokal';
  }
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const d = getFormData();
  if (!d.goal) return;
  showResult(generateTemplate(d), d, 'template');
});
$('result').addEventListener('input', wordCount);
$('copy-btn').addEventListener('click', async () => {
  const el = $('result');
  try {
    if (navigator.clipboard && isSecureContext) await navigator.clipboard.writeText(el.value);
    else { el.select(); if (!document.execCommand('copy')) throw Error(); }
    $('copy-status').textContent = 'Berhasil disalin. Tempelkan ke AI pilihanmu.'; toast('Prompt berhasil disalin!');
  } catch { el.select(); toast('Pilih teks prompt lalu salin secara manual.'); }
});
$('favorite-btn').addEventListener('click', () => {
  const text = $('result').value.trim(); if (!text) return;
  if (favorites.some(x => x.text === text)) { toast('Prompt ini sudah ada di favorit.'); return; }
  favorites.unshift({ id: Date.now(), title: $('goal').value.trim().slice(0, 70), text, category: $('category').value });
  favorites = favorites.slice(0, 30); save(); render(); toast('Disimpan ke favorit di perangkat ini.');
});
$('reset-btn').addEventListener('click', () => $('goal').scrollIntoView({ behavior: 'smooth', block: 'center' }));
function render() {
  const list = $('favorites-list'); list.replaceChildren(); $('favorite-count').textContent = favorites.length; $('favorites-empty').hidden = !!favorites.length;
  favorites.forEach(item => {
    const row = document.createElement('div'); row.className = 'favitem';
    const open = document.createElement('button'); open.className = 'open'; open.type = 'button';
    const title = document.createElement('b'); title.textContent = item.title || 'Prompt tanpa judul';
    const meta = document.createElement('small'); meta.textContent = item.category || 'Umum'; open.append(title, meta);
    open.onclick = () => { $('result-section').hidden = false; $('result').value = item.text; wordCount(); $('result-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    const del = document.createElement('button'); del.className = 'del'; del.type = 'button'; del.textContent = '×'; del.setAttribute('aria-label', 'Hapus favorit');
    del.onclick = () => { favorites = favorites.filter(f => f.id !== item.id); save(); render(); toast('Favorit dihapus.'); };
    row.append(open, del); list.append(row);
  });
}
$('year').textContent = new Date().getFullYear(); render();
