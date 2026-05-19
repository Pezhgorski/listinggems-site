// ListingGems shared site script
// FAQ accordion: click a question to expand, click again to close.
// Opening one auto-closes any others.

document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});
