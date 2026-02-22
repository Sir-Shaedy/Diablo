from backend.modules.scout import ScoutModule


def test_postprocess_report_html_strips_inline_styles_and_adds_evidence_map():
    html = '<h2 style="color:#222">Summary</h2><pre><code></code></pre>'
    matched = [
        {"id": "F1", "title": "Issue A", "firm": "FirmX", "protocol": "ProtoY", "impact": "HIGH"}
    ]
    out = ScoutModule._postprocess_report_html(html, matched)
    assert 'style="' not in out
    assert "Patch/example unavailable in generated output." in out
    assert "Evidence Map" in out
    assert "F1" in out

