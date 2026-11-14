# Filename: test_card_rendering.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from mind.study.rendering import Segment, card_sides


def test_qa_and_other_types_show_front_and_back_as_written() -> None:
    for subtype in ("qa", "compare", "true_false"):
        sides = card_sides(subtype, "Pergunta?", "Resposta.")
        assert sides.front == [Segment("Pergunta?")]
        assert sides.back == [Segment("Resposta.")]


def test_cloze_hides_the_gap_in_front_and_reveals_it_in_the_back() -> None:
    sides = card_sides("cloze", "A {{c1::mitocôndria}} faz a {{c2::respiração}} celular.", "")
    assert sides.front == [
        Segment("A "),
        Segment("[…]", hit=True),
        Segment(" faz a "),
        Segment("[…]", hit=True),
        Segment(" celular."),
    ]
    assert [(s.text, s.hit) for s in sides.back if s.hit] == [
        ("mitocôndria", True),
        ("respiração", True),
    ]
    assert "".join(s.text for s in sides.back) == "A mitocôndria faz a respiração celular."


def test_cloze_extra_comment_goes_after_the_revealed_sentence() -> None:
    sides = card_sides("cloze", "O {{c1::núcleo}} guarda o DNA.", "  Organela com membrana dupla. ")
    assert sides.back[-1] == Segment("\n\nOrganela com membrana dupla.")


def test_cloze_without_gaps_is_shown_unchanged() -> None:
    sides = card_sides("cloze", "Sem lacuna.", "")
    assert sides.front == [Segment("Sem lacuna.")]
    assert sides.back == [Segment("Sem lacuna.")]
