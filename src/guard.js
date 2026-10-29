// Cosmetic only: shows a message when someone presses Ctrl+U (view source).
// Real protection lives in Supabase (RLS + private bucket), not in hiding the page source.
let timer;
function warn() {
  document.querySelector('.guard-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast guard-toast';
  el.setAttribute('role', 'alert');
  el.textContent = 'ملكش دعوه 😏';
  document.body.append(el);
  clearTimeout(timer);
  timer = setTimeout(() => el.remove(), 2600);
}

window.addEventListener('keydown', e => {
  const isU = e.code === 'KeyU' || String(e.key).toLowerCase() === 'u';
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && isU) {
    e.preventDefault();
    e.stopPropagation();
    warn();
  }
}, true);
