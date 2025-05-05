import { useEffect, useRef, useState } from 'react';
import fetch from 'node-fetch';

export async function getStaticProps() {
  const videosJsonUrl = `https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos.json?t=${Date.now()}&cache_bust=${Math.random()}`;
  const proxyUrl = `http://localhost:3000/api/proxy-json?url=${encodeURIComponent(videosJsonUrl)}`;
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[getStaticProps] Fetching videos.json via proxy, attempt ${attempt}/${maxRetries}: ${proxyUrl}`);
      const response = await fetch(proxyUrl, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      console.log(`[getStaticProps] Status: ${response.status}, Headers:`, Object.fromEntries(response.headers));
      if (!response.ok) {
        throw new Error(`Failed to fetch videos.json: ${response.status}`);
      }
      const videosData = await response.json();
      console.log(`[getStaticProps] Fetched videos.json:`, videosData.videos);
      return { props: { videos: videosData.videos || [] } };
    } catch (error) {
      console.error(`[getStaticProps] Error attempt ${attempt}/${maxRetries}: ${error.message}`);
      if (attempt === maxRetries) {
        console.error('[getStaticProps] Max retries reached, returning empty videos');
        return { props: { videos: [] } };
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

export default function Home({ videos: initialVideos }) {
  const [videos, setVideos] = useState(initialVideos);
  const [displayedVideos, setDisplayedVideos] = useState(initialVideos);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const [formData, setFormData] = useState({
    celebrityName: '',
    title: '',
    description: '',
    customScript: '',
    videoUrl: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [isFormActive, setIsFormActive] = useState(false);
  const videoRefs = useRef([]);
  const hasUserInteracted = useRef(false);

  useEffect(() => {
    if (!isStarted || displayedVideos.length === 0 || isFormActive) return;

    const playVideo = (video) => {
      if (video.paused) {
        video.muted = false;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log("Unmuted autoplay failed, trying muted:", error);
            video.muted = true;
            video.play().catch(err => {
              console.error("Both muted and unmuted autoplay failed:", err);
            });
          });
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isFormActive) {
            playVideo(entry.target);
          } else {
            entry.target.pause();
          }
        });
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
      }
    );

    videoRefs.current.forEach((video) => {
      if (video) {
        observer.observe(video);
        if (!isFormActive && video.getBoundingClientRect().top < window.innerHeight) {
          playVideo(video);
        }
      }
    });

    return () => observer.disconnect();
  }, [isStarted, displayedVideos, isFormActive]);

  useEffect(() => {
    console.log('[State Update] Videos:', videos);
    console.log('[State Update] Displayed videos:', displayedVideos);
    console.log('[State Update] Current video index:', currentVideo);
    console.log('[State Update] Has user interacted:', hasUserInteracted.current);
    console.log('[State Update] Is form active:', isFormActive);
    console.log('[State Update] Is generating:', isGenerating);
  }, [videos, displayedVideos, currentVideo, isFormActive, isGenerating]);

  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    videoRefs.current = Array(displayedVideos.length).fill(null);
    let filtered = videos;
    if (query.trim() === '') {
      setDisplayedVideos(videos);
    } else {
      filtered = videos.filter((video) =>
        video.celebrityName.toLowerCase().includes(query)
      );
      setDisplayedVideos(filtered);
    }
    console.log('[Search] Query:', query, 'Filtered videos:', filtered);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      videoUrl: name === 'celebrityName' ? `https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos/${value.toLowerCase().replace(/\s+/g, '-')}-history.mp4` : prev.videoUrl
    }));
  };

  const handleFormFocus = () => {
    setIsFormActive(true);
    videoRefs.current.forEach((video) => {
      if (video) video.pause();
    });
  };

  const handleFormBlur = () => {
    setIsFormActive(false);
  };

  const pollVideo = async (videoUrl, maxAttempts = 10, interval = 3000) => {
    console.log(`[Poll] Starting polling: ${videoUrl}`);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
        console.log(`[Poll] Polling via proxy: ${proxyUrl}`);
        const response = await fetch(proxyUrl, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        console.log(`[Poll] Attempt ${i + 1}/${maxAttempts}, Status: ${response.status}`);
        if (response.ok) {
          console.log(`[Poll] Video found: ${videoUrl}`);
          return true;
        } else if (response.status === 403) {
          throw new Error('Video access denied: Check GitHub repo permissions or GITHUB_TOKEN');
        } else {
          console.log(`[Poll] Video not ready, attempt ${i + 1}/${maxAttempts}: ${videoUrl}`);
        }
      } catch (err) {
        console.error(`[Poll] Error attempt ${i + 1}/${maxAttempts}: ${err.message}`);
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Video polling timed out after ${maxAttempts} attempts`);
  };

  const fetchWithTimeout = async (url, options, timeout) => {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Fetch] Attempt ${attempt}/${maxRetries} for ${url}`);
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
          // Ensure URL is absolute for server-side calls
          const absoluteUrl = url.startsWith('/') 
            ? `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}${url}`
            : url;
          const response = await fetch(absoluteUrl, { ...options, signal: controller.signal });
          clearTimeout(id);
          console.log(`[Fetch] Success for ${url}, Status: ${response.status}`);
          return response;
        } catch (error) {
          clearTimeout(id);
          if (error.name === 'AbortError') {
            console.error(`[Fetch] Timeout after ${timeout}ms for ${url}`);
            if (attempt === maxRetries) {
              throw new Error('Request timed out, but video may still be generating');
            }
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error(`[Fetch] Error attempt ${attempt}/${maxRetries} for ${url}: ${error.message}`);
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  };

  const refreshVideos = async () => {
    const videosJsonUrl = `https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos.json?t=${Date.now()}&cache_bust=${Math.random()}`;
    const proxyUrl = `/api/proxy-json?url=${encodeURIComponent(videosJsonUrl)}`;
    const maxRetries = 3;
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Refresh] Fetching videos.json via proxy, attempt ${attempt}/${maxRetries}: ${proxyUrl}`);
        const response = await fetchWithTimeout(proxyUrl, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }, 30000);
        console.log(`[Refresh] Status: ${response.status}, Headers:`, Object.fromEntries(response.headers));
        if (response.ok) {
          const videosData = await response.json();
          console.log(`[Refresh] Refreshed videos.json:`, videosData.videos);
          setVideos(videosData.videos || []);
          setDisplayedVideos(videosData.videos || []);
          return;
        } else {
          throw new Error(`Failed to refresh videos.json: ${response.status}`);
        }
      } catch (error) {
        console.error(`[Refresh] Error attempt ${attempt}/${maxRetries}: ${error.message}`);
        if (attempt === maxRetries) {
          throw new Error(`Max retries reached for videos.json: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsGenerating(true);
    setIsFormActive(false);
    hasUserInteracted.current = true;

    try {
      console.log('[Submit] Submitting form:', formData);
      const response = await fetchWithTimeout('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      }, 60000);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[Submit] API error:', errorData);
        throw new Error(errorData.error || 'Failed to initiate video generation');
      }

      const newVideo = await response.json();
      console.log('[Submit] API response:', newVideo);
      console.log('[Submit] New video URL:', newVideo.videoUrl);
      try {
        await pollVideo(newVideo.videoUrl);
      } catch (pollError) {
        console.error('[Submit] Poll error:', pollError.message);
        throw pollError;
      }
      try {
        await refreshVideos();
      } catch (refreshError) {
        console.error('[Submit] Refresh error:', refreshError.message);
        throw refreshError;
      }
      setFormData({
        celebrityName: '',
        title: '',
        description: '',
        customScript: '',
        videoUrl: ''
      });
      console.log('[Submit] Form reset, video processed:', newVideo);
    } catch (err) {
      console.error('[Submit] Error:', err.message);
      setError(err.message === 'signal is aborted without reason' ? 'Request timed out, but video may still be generating' : err.message);
    } finally {
      console.log('[Submit] Resetting isGenerating');
      setIsGenerating(false);
    }
  };

  const handleStart = () => {
    setIsStarted(true);
  };

  return (
    <div className="reel-container">
      {!isStarted ? (
        <div className="start-screen">
          <h1>Welcome to Sports Reels!</h1>
          <button onClick={handleStart}>Start Reels</button>
        </div>
      ) : (
        <>
          <div className="form-container">
            <h1 className="title">Sports Reels</h1>
            <h2>Create or Search Sports Reels (scroll down to view reels!)</h2>
            <div className="search-container">
              <label>
                Search Celebrity:
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearch}
                  onFocus={handleFormFocus}
                  onBlur={handleFormBlur}
                  placeholder="e.g., Lionel Messi"
                />
              </label>
            </div>
            <form onSubmit={handleSubmit} onFocus={handleFormFocus} onBlur={handleFormBlur}>
              <label>
                Celebrity Name:
                <input
                  type="text"
                  name="celebrityName"
                  value={formData.celebrityName}
                  onChange={handleInputChange}
                  required
                />
              </label>
              <label>
                Title:
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                />
              </label>
              <label>
                Description:
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  required
                />
              </label>
              <label>
                Custom Script (Narration):
                <textarea
                  name="customScript"
                  value={formData.customScript}
                  onChange={handleInputChange}
                  required
                />
              </label>
              <label>
                Video URL (auto-generated):
                <input
                  type="text"
                  name="videoUrl"
                  value={formData.videoUrl}
                  readOnly
                />
              </label>
              <button type="submit" disabled={isGenerating}>
                {isGenerating ? 'Generating...' : 'Generate/Re-generate Reel'}
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          </div>
          {displayedVideos.length === 0 && searchQuery && (
            <p className="no-results">No videos found for "{searchQuery}"</p>
          )}
          {displayedVideos.map((video, index) => (
            <div key={`${video.id}-${Date.now()}`} className="reel-item">
              <video
                ref={(el) => (videoRefs.current[index] = el)}
                src={`/api/proxy-video?url=${encodeURIComponent(video.videoUrl)}&t=${Date.now()}`}
                className="reel-video"
                loop
                controls
                playsInline
                preload="auto"
                defaultMuted={false}
                onError={(e) => console.error(`[Video] Error loading ${video.videoUrl}:`, e)}
              />
              <div className="overlay">
                <h2>{video.title}</h2>
                <p>{video.description}</p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}