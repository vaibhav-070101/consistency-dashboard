"""Motivational quotes about consistency, discipline, and habits."""

import random

QUOTES = [
    ("Discipline is choosing what you want most over what you want now.", "Abraham Lincoln"),
    ("We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Aristotle"),
    ("The secret of getting ahead is getting started.", "Mark Twain"),
    ("It's not about perfect. It's about effort.", "Jillian Michaels"),
    ("Small disciplines repeated with consistency every day lead to great achievements gained slowly over time.", "John C. Maxwell"),
    ("Success isn't always about greatness. It's about consistency.", "Dwayne Johnson"),
    ("The only way to do great work is to love what you do.", "Steve Jobs"),
    ("Don't watch the clock; do what it does. Keep going.", "Sam Levenson"),
    ("It does not matter how slowly you go as long as you do not stop.", "Confucius"),
    ("Your excuses will always be there. Your opportunities won't.", "Unknown"),
    ("The pain of discipline is nothing like the pain of disappointment.", "Justin Langer"),
    ("Motivation gets you going, but discipline keeps you growing.", "John C. Maxwell"),
    ("You don't have to be extreme, just consistent.", "Unknown"),
    ("A year from now you'll wish you had started today.", "Karen Lamb"),
    ("The difference between who you are and who you want to be is what you do.", "Unknown"),
    ("Hard work beats talent when talent doesn't work hard.", "Tim Notke"),
    ("The only impossible journey is the one you never begin.", "Tony Robbins"),
    ("Champions keep playing until they get it right.", "Billie Jean King"),
    ("If you're tired of starting over, stop giving up.", "Unknown"),
    ("Consistency is what transforms average into excellence.", "Unknown"),
    ("The man who moves a mountain begins by carrying away small stones.", "Confucius"),
    ("Fall seven times, stand up eight.", "Japanese Proverb"),
    ("What you do every day matters more than what you do once in a while.", "Gretchen Rubin"),
    ("Progress is not achieved by luck or accident, but by working on yourself daily.", "Epictetus"),
    ("First forget inspiration. Habit is more dependable.", "Octavia Butler"),
]


def get_random_quote() -> dict:
    text, author = random.choice(QUOTES)
    return {"text": text, "author": author}
