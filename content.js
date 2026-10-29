function getVideoInfo() {
  const video = document.querySelector('video');
  return {
    url: location.href.split('&')[0],
    videoId: new URL(location.href).searchParams.get('v') || '',
    title: document.querySelector('h1 yt-formatted-string')?.textContent?.trim() || document.title.replace(/ - YouTube$/, ''),
    channel: document.querySelector('#owner #channel-name a')?.textContent?.trim() || '',
    duration: video?.duration || 0
  };
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_VIDEO_INFO') sendResponse(getVideoInfo());
  if (msg?.type === 'SEEK_VIDEO') {
    const video = document.querySelector('video');
    if (video) { video.currentTime = Math.max(0, Number(msg.seconds) || 0); video.play().catch(() => {}); }
    sendResponse({ok: !!video});
  }
  return true;
});
