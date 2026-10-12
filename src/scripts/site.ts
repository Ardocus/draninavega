// Progressive enhancement only. The page works fully without JavaScript.

// 1. Announcement banner: show only inside its start/end window (Puerto Rico dates),
//    so a banner scheduled ahead of time appears and expires without a redeploy.
const banner = document.querySelector<HTMLElement>('[data-announce]');
if (banner) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico' }).format(new Date());
  const { start = '', end = '' } = banner.dataset;
  banner.hidden = !((!start || today >= start) && (!end || today <= end));
}

// 2. Language switch: land on the same section in the other language.
const map: Record<string, string> = JSON.parse(document.documentElement.dataset.anchorMap || '{}');
const switches = document.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]');
const sections = Object.keys(map)
  .map((id) => document.getElementById(id))
  .filter((el): el is HTMLElement => !!el);

if (switches.length && sections.length) {
  const base = switches[0].getAttribute('href') || '/';
  const setTarget = (id: string | null) => {
    const hash = id && id !== sections[0].id ? `#${map[id]}` : '';
    switches.forEach((a) => a.setAttribute('href', base + hash));
  };

  // The section whose top most recently crossed the upper third of the viewport.
  const current = () => {
    const line = window.innerHeight / 3;
    let id: string | null = null;
    for (const s of sections) if (s.getBoundingClientRect().top <= line) id = s.id;
    return id;
  };

  let queued = false;
  const update = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; setTarget(current()); });
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('hashchange', update);
  update();
}
