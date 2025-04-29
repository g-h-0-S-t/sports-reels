import json
import os
import argparse
from transformers import pipeline
from moviepy import ImageClip, concatenate_videoclips, AudioFileClip
from gtts import gTTS
import requests

def fetch_images(query, count=3):
    access_key = "LLn6Z2X8dg630nsWa5k96uNtjPPrG8R91oWAE0LpAd8"
    url = f"https://api.unsplash.com/search/photos?query={query}&per_page={count}&client_id={access_key}"
    response = requests.get(url)
    data = response.json()
    return [photo['urls']['regular'] for photo in data['results']]

def generate_script(celebrity, custom_script=None):
    if custom_script:
        return custom_script
    generator = pipeline('text-generation', model='gpt2')
    prompt = f"Tell me a short history of {celebrity} in 50 words."
    script = generator(prompt, max_length=60, num_return_sequences=1, truncation=True)[0]['generated_text']
    return script

def create_video(celebrity, output_path, custom_script=None):
    audio_path = os.path.join(os.path.dirname(output_path), f"{celebrity.replace(' ', '_')}_audio.mp3")
    script = generate_script(celebrity, custom_script)
    tts = gTTS(script)
    print(f"Saving audio to: {audio_path}")
    tts.save(audio_path)
    
    image_urls = fetch_images(celebrity)
    clips = []
    temp_image_paths = []
    for i, url in enumerate(image_urls):
        img_data = requests.get(url).content
        img_path = os.path.join(os.path.dirname(output_path), f"temp_{i}.jpg")
        print(f"Saving image to: {img_path}")
        with open(img_path, 'wb') as f:
            f.write(img_data)
        clip = ImageClip(img_path, duration=3)
        clips.append(clip)
        temp_image_paths.append(img_path)
    
    video = concatenate_videoclips(clips)
    audio = AudioFileClip(audio_path)
    final_video = video.with_audio(audio)
    print(f"Saving video to: {output_path}")
    final_video.write_videofile(output_path, fps=24)
    
    print(f"Cleaning up: {audio_path}, {temp_image_paths}")
    os.remove(audio_path)
    for img_path in temp_image_paths:
        os.remove(img_path)

def main():
    parser = argparse.ArgumentParser(description="Generate sports reels videos")
    parser.add_argument('--single', type=str, help="ID of a single video to generate")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)
    print(f"Current working directory: {os.getcwd()}")

    try:
        with open('./data/videos.json', 'r') as f:
            video_data = json.load(f)
    except FileNotFoundError:
        print("Error: videos.json not found in ./data/")
        exit(1)
    except json.JSONDecodeError:
        print("Error: Invalid JSON in videos.json")
        exit(1)

    output_dir = os.path.join(project_root, "public", "videos")
    os.makedirs(output_dir, exist_ok=True)
    print(f"Output directory: {output_dir}")

    if args.single:
        video = next((v for v in video_data['videos'] if v['id'] == args.single), None)
        if not video:
            print(f"Error: Video with ID {args.single} not found")
            exit(1)
        celebrity = video['celebrityName']
        file_name = os.path.basename(video['videoUrl']).replace('.mp4', '') + '.mp4'
        output_path = os.path.join(output_dir, file_name)
        custom_script = video.get('customScript')
        print(f"Generating video for {celebrity} at {output_path}")
        create_video(celebrity, output_path, custom_script)
    else:
        for video in video_data['videos']:
            celebrity = video['celebrityName']
            file_name = os.path.basename(video['videoUrl']).replace('.mp4', '') + '.mp4'
            output_path = os.path.join(output_dir, file_name)
            custom_script = video.get('customScript')
            print(f"Generating video for {celebrity} at {output_path}")
            create_video(celebrity, output_path, custom_script)

if __name__ == "__main__":
    main()