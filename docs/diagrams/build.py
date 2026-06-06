# Cmd+V vs Ctrl+V 이미지 붙여넣기 흐름 다이어그램 생성 스크립트
# 실행: docs/diagrams/.venv/bin/python docs/diagrams/build.py
# 출력: docs/images/paste-flow.png
from diagrams import Cluster, Diagram, Edge
from diagrams.generic.blank import Blank

# macOS 한글 폰트 지정 (깨짐 방지)
FONT = "AppleSDGothicNeo-Regular"

graph_attr = {
    "fontname": FONT,
    "fontsize": "20",
    "pad": "0.4",
    "splines": "spline",
    "nodesep": "0.5",
    "ranksep": "0.7",
}
node_attr = {
    "fontname": FONT,
    "fontsize": "13",
    "shape": "box",
    "style": "rounded,filled",
    "fillcolor": "#f5f5f5",
    "width": "2.6",
    "height": "0.7",
}
edge_attr = {"fontname": FONT, "fontsize": "11"}


def box(label: str, color: str = "#f5f5f5") -> Blank:
    return Blank(label, fillcolor=color, image="")


with Diagram(
    "macOS 터미널에서 이미지 붙여넣기 — Cmd+V 와 Ctrl+V 의 차이",
    filename="docs/images/paste-flow",
    outformat="png",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    clipboard = box("클립보드 (NSPasteboard)\n스크린샷 이미지 PNGf", "#fff3c4")

    with Cluster("① Cmd+V — GUI 레벨에서 소비됨", graph_attr={"fontname": FONT, "bgcolor": "#fdecea"}):
        cmdv = box("Cmd+V 키 입력", "#ffffff")
        term = box("터미널 에뮬레이터\n(iTerm2 / Terminal.app)", "#ffffff")
        pty1 = box("PTY (텍스트 바이트 스트림)", "#ffffff")
        app1 = box("ai-panel (stdin)", "#ffffff")

        cmdv >> Edge(label="GUI 단축키 → Paste 액션") >> term
        term >> Edge(label="텍스트 타입만 꺼냄\n이미지면 보낼 것이 없음", color="#c0392b", style="bold") >> pty1
        pty1 >> Edge(label="∅ 아무 바이트도 도착 안 함", color="#c0392b", style="dashed") >> app1

    with Cluster("② Ctrl+V — 제어문자로 앱까지 전달됨", graph_attr={"fontname": FONT, "bgcolor": "#e8f5e9"}):
        ctrlv = box("Ctrl+V 키 입력", "#ffffff")
        pty2 = box("PTY (0x16 제어문자 통과)", "#ffffff")
        app2 = box("ai-panel\n0x16 감지", "#ffffff")
        osa = box("osascript 로 클립보드\n이미지 직접 조회", "#ffffff")
        chip = box("임시 PNG 저장 →\n[Image #1] 칩 표시", "#c8e6c9")

        ctrlv >> Edge(label="터미널이 가로채지 않음") >> pty2
        pty2 >> app2
        app2 >> Edge(label="앱이 직접 꺼냄", color="#27ae60", style="bold") >> osa
        osa >> chip

    clipboard >> Edge(style="dotted", label="터미널이 조회 (텍스트만)") >> term
    clipboard >> Edge(style="dotted", color="#27ae60", label="앱이 조회 (이미지 OK)") >> osa
