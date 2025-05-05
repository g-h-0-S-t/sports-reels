import { useEffect, useRef, useState } from 'react';
import fetch from 'node-fetch';

export async function getStaticProps() {
  const videosJsonUrl = 'https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos.json';
  try {
    const response = await fetch(videosJsonUrl);
    if (!response.ok) {
      console.error(`Failed to fetch videos.json: ${response.status}`);
      return { props: { videos: [] } };
    }
    const videosData = await response.json();
    return { props: { videos: videosData.videos || [] } };
  } catch (error) {
    console.error(`Error fetching videos.json: ${error.message}`);
    return { props: { videos: [] } };
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

    // Function to play video
    const playVideo = (video) => {
      if (video.paused) {
        video.muted = false; // Try to play unmuted
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
    console.log('Videos state updated:', videos);
    console.log('Displayed videos:', displayedVideos);
    console.log('Current video index:', currentVideo);
    console.log('Has user interacted:', hasUserInteracted.current);
    console.log('Is form active:', isFormActive);
  }, [videos, displayedVideos, currentVideo, isFormActive]);

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
    console.log('Search query:', query, 'Filtered videos:', filtered);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      videoUrl: name === 'celebrityName' ? `/videos/${value.toLowerCase().replace(/\s+/g, '-')}-history.mp4` : prev.videoUrl
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

  const pollVideo = async (videoUrl, maxAttempts = 180, interval = 5000) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(videoUrl);
        if (response.ok) {
          console.log(`Video found: ${videoUrl}`);
          return true;
        }
      } catch (err) {
        console.log(`Video not ready: ${videoUrl}`);
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Video generation timed out');
  };

  const refreshVideos = async () => {
    const videosJsonUrl = 'https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos.json';
    try {
      const response = await fetch(videosJsonUrl);
      if (response.ok) {
        const videosData = await response.json();
        setVideos(videosData.videos || []);
        setDisplayedVideos(videosData.videos || []);
        console.log('Refreshed videos.json:', videosData.videos);
      } else {
        console.error(`Failed to refresh videos.json: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error refreshing videos.json: ${error.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsGenerating(true);
    setIsFormActive(false); // Allow videos to play after submission
    hasUserInteracted.current = true;

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initiate video generation');
      }

      const newVideo = await response.json();
      await pollVideo(newVideo.videoUrl);
      await refreshVideos();
      setFormData({
        celebrityName: '',
        title: '',
        description: '',
        customScript: '',
        videoUrl: ''
      });
      console.log('Video processed:', newVideo);
    } catch (err) {
      console.error('Submit error:', err.message);
      setError(err.message);
    } finally {
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
                src={`${video.videoUrl}?t=${Date.now()}`}
                className="reel-video"
                loop
                controls
                playsInline
                preload="auto"
                defaultMuted={false}
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