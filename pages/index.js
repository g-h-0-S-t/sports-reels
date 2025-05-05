import { useEffect, useRef, useState } from 'react';
import fetch from 'node-fetch';

export async function getStaticProps() {
  const videosJsonUrl = `https://api.github.com/repos/g-h-0-S-t/sports-reels-videos/contents/videos.json?ref=main&t=${Date.now()}`;
  const proxyUrl = new URL('/api/proxy-json', process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : process.env.NEXT_PUBLIC_APP_URL || 'https://sports-reels.onrender.com');
  proxyUrl.searchParams.append('url', videosJsonUrl);
  proxyUrl.searchParams.append('token', process.env.GITHUB_TOKEN);

  try {
    console.log(`[getStaticProps] Fetching videos.json via proxy: ${proxyUrl}`);
    const response = await fetch(proxyUrl, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch videos.json: ${response.status}`);
    }
    const data = await response.json();
    const videosData = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    console.log(`[getStaticProps] Fetched videos.json from GitHub:`, videosData.videos);
    return {
      props: { videos: videosData.videos || [] },
      revalidate: 60
    };
  } catch (error) {
    console.error(`[getStaticProps] Error fetching videos.json: ${error.message}`);
    return {
      props: { videos: [] },
      revalidate: 60
    };
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isFormActive, setIsFormActive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const videoRefs = useRef([]);

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
    console.log('[State Update] Is form active:', isFormActive);
    console.log('[State Update] Is generating:', isGenerating);
    console.log('[State Update] Is refreshing:', isRefreshing);
    console.log('[State Update] Refresh key:', refreshKey);
  }, [videos, displayedVideos, currentVideo, isFormActive, isGenerating, isRefreshing, refreshKey]);

  useEffect(() => {
    console.log('[Videos State] Updated:', videos.length, 'videos');
    console.log('[Videos State] First video:', videos[0]);
    console.log('[Videos State] Displayed videos:', displayedVideos.length);
    videoRefs.current = Array(displayedVideos.length).fill(null);
  }, [videos, displayedVideos]);

  useEffect(() => {
    if (isStarted && !isRefreshing) {
      refreshVideos();
    }
  }, [isStarted]);

  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    if (query.trim() === '') {
      setDisplayedVideos([...videos]);
    } else {
      const filtered = videos.filter((video) =>
        video.celebrityName.toLowerCase().includes(query) ||
        video.title.toLowerCase().includes(query) ||
        video.description.toLowerCase().includes(query)
      );
      setDisplayedVideos([...filtered]);
      console.log('[Search] Query:', query, 'Filtered videos:', filtered);
    }
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

  const pollVideo = async (videoUrl, maxAttempts = 15, interval = 5000) => {
    console.log(`[Poll] Starting polling: ${videoUrl}`);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
        console.log(`[Poll] Polling via proxy: ${proxyUrl}`);
        const response = await fetchWithTimeout(proxyUrl, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }, 10000);
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
          const response = await fetch(url, { ...options, signal: controller.signal });
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
    setIsRefreshing(true);
    try {
      console.log('[Refresh] Fetching videos via /api/refresh-videos');
      const response = await fetchWithTimeout('/api/refresh-videos', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }, 30000);

      if (!response.ok) {
        throw new Error(`Failed to refresh videos: ${response.status}`);
      }

      const { videos: newVideos } = await response.json();
      console.log('[Refresh] Refreshed videos:', newVideos);

      setVideos([...newVideos]);
      setDisplayedVideos([...newVideos]);
      setRefreshKey(prev => prev + 1);
      console.log('[Refresh] Updated videos and displayedVideos:', newVideos);
    } catch (error) {
      console.error(`[Refresh] Error: ${error.message}`);
      setError(`Failed to refresh videos: ${error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsGenerating(true);
    setIsFormActive(false);

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

      const { videoUrl, videos: newVideos } = await response.json();
      console.log('[Submit] API response:', { videoUrl, videos: newVideos });

      try {
        await pollVideo(videoUrl);
        console.log('[Submit] Video polling successful');
        setVideos([...newVideos]);
        setDisplayedVideos([...newVideos]);
        setRefreshKey(prev => prev + 1);
        setFormData({
          celebrityName: '',
          title: '',
          description: '',
          customScript: '',
          videoUrl: ''
        });
        setSearchQuery('');
        console.log('[Submit] Form and search reset, videos updated:', newVideos);
      } catch (pollError) {
        console.error('[Submit] Poll error:', pollError.message);
        throw new Error(`Video polling failed: ${pollError.message}`);
      }
    } catch (err) {
      console.error('[Submit] Error:', err.message);
      setError(err.message === 'signal is aborted without reason'
        ? 'Request timed out, but video may still be generating'
        : `Failed to generate video: ${err.message}. Check server logs for details.`);
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
      {(isGenerating || isRefreshing) && (
        <div className="loader-overlay">
          <div className="loader">
            <div className="golf-ball"></div>
            <p>{isGenerating ? 'Generating your sports reel...' : 'Refreshing videos...'}</p>
          </div>
        </div>
      )}
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
              <button type="submit" disabled={isGenerating || isRefreshing}>
                {isGenerating ? 'Generating...' : 'Generate/Re-generate Reel'}
              </button>
              <button type="button" onClick={refreshVideos} disabled={isGenerating || isRefreshing}>
                Refresh Videos
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          </div>
          {videos.length === 0 && !searchQuery && (
            <p className="no-videos">No videos available. Try generating a new reel!</p>
          )}
          {displayedVideos.length === 0 && searchQuery && (
            <p className="no-results">No videos found for "{searchQuery}"</p>
          )}
          <div className="reels-container">
            {displayedVideos.map((video, index) => (
              <div key={`${video.id}-${refreshKey}`} className="reel-item">
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
          </div>
        </>
      )}
      <style jsx>{`
        .loader-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .loader {
          text-align: center;
          color: #fff;
        }
        .golf-ball {
          width: 50px;
          height: 50px;
          background: radial-gradient(circle, #fff, #e0e0e0);
          border-radius: 50%;
          position: relative;
          animation: spin 1s linear infinite;
          margin: 0 auto 10px;
        }
        .golf-ball::before {
          content: '';
          position: absolute;
          top: 10px;
          left: 10px;
          width: 5px;
          height: 5px;
          background: #888;
          border-radius: 50%;
          box-shadow:
            15px 0 0 #888,
            0 15px 0 #888,
            15px 15px 0 #888,
            10px 5px 0 #888,
            5px 10px 0 #888;
        }
        .loader p {
          font-size: 1.2em;
          font-weight: bold;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}