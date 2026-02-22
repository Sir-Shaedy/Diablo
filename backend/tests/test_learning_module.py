from backend.modules.learning import LearningModule


def test_normalize_correct_index_one_based():
    idx = LearningModule._normalize_correct_index(
        raw_correct=2,
        options_count=4,
        block_html="",
        explanation_html="",
    )
    assert idx == 1


def test_normalize_correct_index_from_answer_letter():
    idx = LearningModule._normalize_correct_index(
        raw_correct=0,
        options_count=4,
        block_html="<div class='quiz-explanation'>Answer: C</div>",
        explanation_html="Answer: C",
    )
    assert idx == 2


def test_postprocess_lesson_html_fills_empty_code_and_normalizes_quiz_index():
    html = """
    <h2>Quiz</h2>
    <div class="quiz-question" data-correct="1">
      <p>Q1</p>
      <pre><code></code></pre>
      <div class="quiz-option">A. foo</div>
      <div class="quiz-option">B. bar</div>
      <div class="quiz-option">C. baz</div>
      <div class="quiz-option">D. qux</div>
      <div class="quiz-explanation">Answer: B</div>
    </div>
    """
    out = LearningModule._postprocess_lesson_html(html)
    assert "Source snippet unavailable in finding body." in out
    assert 'data-correct="1"' in out


def test_parse_quiz_handles_malformed_html_without_crashing():
    malformed = """
    <div class="quiz-question" data-correct="2">
      <p>Q1
      <div class="quiz-option">A</div>
      <div class="quiz-option">B</div>
      <div class="quiz-option">C</div>
      <div class="quiz-option">D</div>
    """
    parsed = LearningModule._parse_quiz(malformed)
    assert isinstance(parsed, list)

