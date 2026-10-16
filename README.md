# Video Response Study

A local Python application for presenting four complete YouTube videos, collecting
numeric Self-Assessment Manikin (SAM) responses, playing a 20-second white-noise
interval between videos, and exporting the results to Excel.

## What the application does

The fixed sequence is:

1. Record a pre-video baseline using the pleasure and arousal image scales.
   The participant must click a number for every scale. These responses and response
   times are saved as the `Baseline` measurement phase.
2. Show a ready screen so the participant explicitly starts the recorded sequence.
3. Play the complete stimulus video. Playback controls are covered so the participant
   cannot seek or skip through the video.
4. Present **pleasure** and **arousal** as separate 1–9 image scales. A
   participant can click a number or press keys 1–9. The application cannot advance
   until a response is selected, so there is no automatic scale timeout.
5. After videos 1–3, play exactly 20 seconds of the black-screen white-noise source,
   beginning at 1:00 in that source. Buffering time does not count toward the
   20-second interval. There is no white-noise interval after video 4.
6. After the video 4 ratings, create the Excel results.

The completion screen displays one combined line graph across the five measurement
timepoints: Baseline and Videos 1–4. Pleasure and arousal are shown as two separate
series on the same 1–9 scale. The participant can download this graph as a PNG image.

The third video's selectable YouTube caption track is explicitly disabled. Text that
is permanently part of an uploaded video image cannot be removed by the YouTube API.

## Install and run

Python 3.10 or newer is recommended.

```powershell
python -m pip install -r requirements.txt
python app.py
```

The application opens `http://127.0.0.1:8787` in the default browser. Keep the
PowerShell window open during the experiment. Press `Ctrl+C` there after the session
to stop the server.

If port 8787 is already in use:

```powershell
python app.py --port 8790
```

## Results

Completed files are written automatically to `results/`:

- One timestamped `.xlsx` workbook for each participant/session.
- `all_participants.xlsx`, which accumulates five rows per completed session: one
  baseline row followed by four post-video rows.
- `results/checkpoints/`, containing JSON recovery records saved after each video.

The completion screen offers **Download graph (PNG)** and **Download Excel file**
buttons. Each workbook contains ratings, response times in milliseconds, video
metadata, UTC timestamps, measurement phase labels, scale anchors, and timing
parameters.

Each individual workbook opens with a **Response graph** worksheet containing the
five-timepoint data table and an editable Excel line chart with both scales.

Do not keep `all_participants.xlsx` open in Excel while another session finishes;
Windows may prevent the application from updating an open workbook. The individual
participant workbook will still be saved if this happens.

## Research-use notes

- Internet access is required during the experiment because the videos stream from
  YouTube.
- Before data collection, confirm every video can be embedded and played from the
  study computer. A creator can later disable embedding or remove a video.
- YouTube may show branding or advertising. For tightly controlled experimental
  timing and content, use properly licensed local video files instead of YouTube.
- The interface uses the supplied `Slide8.JPG` and `Slide9.JPG` scale images, with
  separate clickable number buttons from 1 to 9.
- The app keeps the requested fixed presentation order. If the study needs
  counterbalancing or randomization, add that before collecting data.

## Configuration

The video list and timing constants are near the top of `app.py`:

```python
NOISE_SECONDS = 20
NOISE_START_SECONDS = 60
VIDEOS = [...]
```

The Python server only listens on `127.0.0.1`, so it is not exposed to other devices
on the network.
