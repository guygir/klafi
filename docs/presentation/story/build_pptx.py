#!/usr/bin/env python3
"""Build the story-version Kalpi pitch as PPTX."""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import nsmap
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

INK = RGBColor(0x1A, 0x1F, 0x1C)
PAPER = RGBColor(0xF4, 0xEF, 0xE4)
CIVIC = RGBColor(0x1F, 0x4F, 0x4A)
OUT = Path(__file__).with_name("kalpi-story.pptx")
ASSETS = Path(__file__).resolve().parents[2] / "design" / "assets"

# 16:9
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)


def _set_run(run, text, size, bold=False, color=INK, font="Georgia"):
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = font


def add_bg(slide):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = PAPER


def add_kicker(slide, text):
    box = slide.shapes.add_textbox(Inches(0.9), Inches(0.45), Inches(11.4), Inches(0.4))
    p = box.text_frame.paragraphs[0]
    _set_run(p.add_run() if p.runs else p.add_run(), "", 13, True, CIVIC, "Calibri")
    # paragraph already has an empty run after add; reset
    tf = box.text_frame
    tf.clear()
    p = tf.paragraphs[0]
    run = p.add_run()
    _set_run(run, text.upper(), 13, True, CIVIC, "Calibri")


def add_title(slide, text, top=1.1, size=44, width=11.5):
    box = slide.shapes.add_textbox(Inches(0.9), Inches(top), Inches(width), Inches(2.4))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    _set_run(run, text, size, False, INK, "Georgia")
    return box


def add_body(slide, text, top=3.6, size=22, width=10.5):
    box = slide.shapes.add_textbox(Inches(0.9), Inches(top), Inches(width), Inches(3.2))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    _set_run(run, text, size, False, INK, "Calibri")
    return box


def add_footer(slide, n, total=14):
    box = slide.shapes.add_textbox(Inches(0.9), Inches(7.05), Inches(6), Inches(0.3))
    p = box.text_frame.paragraphs[0]
    run = p.add_run()
    _set_run(run, "Kalpi  ·  story v2", 12, False, CIVIC, "Calibri")
    box2 = slide.shapes.add_textbox(Inches(10.4), Inches(7.05), Inches(2), Inches(0.3))
    p2 = box2.text_frame.paragraphs[0]
    p2.alignment = PP_ALIGN.RIGHT
    run2 = p2.add_run()
    _set_run(run2, f"{n}  /  {total}", 12, False, CIVIC, "Calibri")


def new_slide():
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_bg(slide)
    return slide


# 1
s = new_slide()
add_kicker(s, "Version B  ·  the story")
add_title(s, "Who does not reach the kalpi.", 1.3, 52)
add_body(s, "And a pack of cards that might change that before 27 October.", 4.0, 24)
add_footer(s, 1)

# 2
s = new_slide()
add_kicker(s, "The last official number")
left = s.shapes.add_textbox(Inches(0.9), Inches(1.5), Inches(5.5), Inches(3.4))
tf = left.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
r = p.add_run()
_set_run(r, "46.7%", 72, False, CIVIC, "Georgia")
p2 = tf.add_paragraph()
r2 = p2.add_run()
_set_run(r2, "of 18–24s voted after 2021.", 22, False, INK, "Calibri")
right = s.shapes.add_textbox(Inches(7.0), Inches(1.5), Inches(5.5), Inches(3.4))
tf = right.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
r = p.add_run()
_set_run(r, "74.9%", 72, False, CIVIC, "Georgia")
p2 = tf.add_paragraph()
r2 = p2.add_run()
_set_run(r2, "of 65–74s did.", 22, False, INK, "Calibri")
add_body(s, "Knesset Research and Information Center, 2022.", 5.5, 16)
add_footer(s, 2)

# 3
s = new_slide()
add_kicker(s, "That is the issue")
add_title(s, "Not a vibe. A 28-point age gap.", 1.2, 44)
add_body(s, "National turnout in 2022 was 70.6%. Young adults are a different electorate. The youth rate has been rising, and they vote more than young Europeans. The gap with older Israelis is still the fact.", 3.8, 22)
add_footer(s, 3)

# 4
s = new_slide()
add_kicker(s, "This year")
box = s.shapes.add_textbox(Inches(0.9), Inches(1.4), Inches(11), Inches(1.6))
p = box.text_frame.paragraphs[0]
r = p.add_run()
_set_run(r, "~600k", 80, False, CIVIC, "Georgia")
add_title(s, "first-timers. About six seats.", 3.2, 40)
add_body(s, "595–640 thousand people aged 18–22. 8.7% of the roll. Election day 27 October 2026.", 5.2, 20)
add_footer(s, 4)

# 5
s = new_slide()
add_kicker(s, "The headline you will hear")
add_title(s, "“This year they say they will vote.”", 1.3, 40)
add_body(s, "IDI, May 2026: 80–95% of first-timers intend to. Hold that number. It is not a forecast.", 4.0, 24)
add_footer(s, 5)

# 6
s = new_slide()
add_kicker(s, "Because surveys always look like that")
add_title(s, "2013: 88% intended. 92% later said they voted. 67.8% actually did.", 1.2, 36)
add_body(s, "Same institute (IDI). Ages 18–22 were already the most likely to stay home. Vote questions run hot. Official counts do not.", 4.4, 22)
add_footer(s, 6)

# 7
s = new_slide()
add_kicker(s, "Working assumption")
add_title(s, "Youth turnout will still be low.", 1.3, 44)
add_body(s, "Even if 2026 is a few points above 46.7%, it is still low versus older adults. Then the second job: the slip has to be informed.", 3.9, 24)
add_footer(s, 7)

# 8
s = new_slide()
add_kicker(s, "The audience")
add_title(s, "18–24. First-timers. Feed politics.", 1.3, 40)
add_body(s, "Social is their #1 political source. Most do not seek it. They distrust parties. They do not live in manifesto PDFs.", 3.9, 24)
add_footer(s, 8)

# 9
s = new_slide()
add_kicker(s, "What characterizes them")
add_title(s, "47 seconds. Dopamine. Viral or invisible.", 1.3, 40)
add_body(s, "Gloria Mark: average screen focus is 47 seconds, median 40. Age of wars and TikTok. If it is not a daily loop, it is a lecture they will not finish.", 4.0, 22)
add_footer(s, 9)

# 10
s = new_slide()
add_kicker(s, "What already works")
add_title(s, "They already collect cards.", 1.3, 44)
add_body(s, "Pokémon TCG Pocket is collection-first, global, daily rips. State Makers sold out a 98-card Israeli history set. We point that format at this election.", 3.9, 22)
add_footer(s, 10)

# 11
s = new_slide()
add_kicker(s, "Therefore")
add_title(s, "Kalpi.", 1.4, 72)
add_body(s, "A free digital collect-only TCG of the lists. Daily pack. The rip is bait. The back is the lesson. Show up on 27 October.", 3.8, 24)
add_footer(s, 11)

# 12
s = new_slide()
add_kicker(s, "The rip")
x = 0.9
for name in ("hero-art-kalpi.png", "hero-art-threshold.png", "hero-art-memchetlammed.png"):
    path = ASSETS / name
    if path.exists():
        s.shapes.add_picture(str(path), Inches(x), Inches(1.3), Inches(2.3), Inches(3.22))
    x += 2.55
add_body(s, "Collect only. Equal sets. No lore. No battles. Flip the back — that beat is the product.", 4.8, 20)
add_footer(s, 12)

# 13
s = new_slide()
add_kicker(s, "On the art")
add_title(s, "Yes, it is AI. The election is in eight weeks.", 1.2, 40)
add_body(s, "This community often prefers hand-made art. We are not claiming AI is more original. Lists file 9 September. Virality needs weeks. Hand-painting every member of every list is how you miss October. The cause is the deadline.", 4.0, 22)
add_footer(s, 13)

# 14
s = new_slide()
add_kicker(s, "27 October 2026")
add_title(s, "Assume the gap. Then give them a pack they will open.", 1.3, 40)
add_body(s, "Official youth turnout has been 46.7%. Surveys will always say 90. Free. Equal. Informed slip. Then show up.", 4.4, 22)
add_footer(s, 14)

prs.save(OUT)
print(f"Wrote {OUT}")
