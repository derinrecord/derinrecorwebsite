(() => {
  const target = new Date('2028-07-14T17:00:00Z').getTime();
  const update = () => {
    const remaining = Math.max(0, target - Date.now());
    const seconds = Math.floor(remaining / 1000);
    const values = { days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60 };
    Object.entries(values).forEach(([name, value]) => document.querySelector(`[data-${name}]`).textContent = String(value).padStart(2, '0'));
  };
  update();
  setInterval(update, 1000);
})();
