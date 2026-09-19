from io import BytesIO
import warnings

import av
from PIL import Image, ImageOps, UnidentifiedImageError


MAX_PHOTO_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_AUDIO_SECONDS = 120
Image.MAX_IMAGE_PIXELS = 20_000_000


def prepare_photo(upload):
    if upload is None:
        raise ValueError("Choose a photo.")
    content = upload.read(MAX_PHOTO_BYTES + 1)
    if len(content) > MAX_PHOTO_BYTES:
        raise ValueError("Photos must be 8 MB or smaller.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.format not in {"JPEG", "PNG", "WEBP"} or getattr(source, "n_frames", 1) != 1:
                    raise ValueError("Choose a JPEG, PNG or WebP photo.")
                source.load()
                image = ImageOps.exif_transpose(source)
                image.thumbnail((1920, 1920))
                image = image.convert("RGB")
                output = BytesIO()
                image.save(output, format="JPEG", quality=85, optimize=True)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError("Choose a valid photo under 20 megapixels.") from None


def prepare_audio(upload):
    if upload is None:
        raise ValueError("Record a voice note first.")
    content = upload.read(MAX_AUDIO_BYTES + 1)
    if len(content) > MAX_AUDIO_BYTES:
        raise ValueError("Voice notes must be 5 MB or smaller.")
    if content.startswith(b"\x1a\x45\xdf\xa3"):
        container_format, media_type = "matroska", "audio/webm"
    elif content.startswith(b"OggS"):
        container_format, media_type = "ogg", "audio/ogg"
    elif content[4:8] == b"ftyp":
        container_format, media_type = "mov", "audio/mp4"
    elif content.startswith(b"RIFF") and content[8:12] == b"WAVE":
        container_format, media_type = "wav", "audio/wav"
    else:
        raise ValueError("Use a valid WebM, Ogg, MP4 or WAV voice note.")
    try:
        with av.open(BytesIO(content), format=container_format, options={"protocol_whitelist": "pipe"}) as container:
            if len(container.streams) != 1 or len(container.streams.audio) != 1:
                raise ValueError("Voice notes must contain audio only.")
            duration = 0.0
            for frame in container.decode(audio=0):
                if not frame.sample_rate:
                    raise ValueError("This voice note could not be read.")
                duration += frame.samples / frame.sample_rate
                if duration > MAX_AUDIO_SECONDS + 0.1:
                    raise ValueError("Voice notes can be up to 2 minutes long.")
            if duration <= 0:
                raise ValueError("This voice note is empty.")
    except (av.FFmpegError, EOFError, OverflowError):
        raise ValueError("This voice note could not be read.") from None
    return content, media_type, round(duration, 2)