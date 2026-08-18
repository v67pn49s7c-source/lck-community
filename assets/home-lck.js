// 홈 화면의 LCK 시즌 모듈.
// index.html은 공통 껍데기만 가지고, 시즌별 본문은 HOME_MODULES에서 갈아 끼운다.
(function () {
  "use strict";
  window.HOME_MODULES = window.HOME_MODULES || {};

  const template = `
    <main class="page home-redesign-page">
      <div class="container">
        <section class="fanpick-bar" id="fanpick-bar" style="display:none" aria-label="응원팀 고르기"></section>
        <div class="home-layout">
          <div class="stack home-main-column">
            <section class="card home-board-card">
              <div class="card-head">
                <h2 class="card-title">전체 게시판 <span class="sub">최신 글 5개</span></h2>
                <a class="card-more" href="community.html">전체 글 ›</a>
              </div>
              <div class="home-board-tabs" aria-label="게시판 분류">
                <button type="button" class="active" data-home-cat="전체">전체</button>
                <button type="button" data-home-cat="자유">자유</button>
                <button type="button" data-home-cat="경기 분석">경기 분석</button>
                <button type="button" data-home-cat="밴픽·메타">밴픽·메타</button>
                <button type="button" data-home-cat="영상·짤">영상·짤</button>
              </div>
              <div id="hot-posts"></div>
              <div class="home-board-cta"><span>응원팀 이야기부터 경기 분석까지</span><a href="write.html">새 글 쓰기</a></div>
            </section>
            <section class="card home-news-card" id="home-news-card" style="display:none">
              <div class="card-head"><h2 class="card-title">LCK 뉴스</h2></div><div id="home-news-body"></div>
            </section>
            <section class="card home-pulse-card" id="home-pulse-card" style="display:none">
              <div class="home-pulse-copy"><span>지금 팬들이 고른 승부처</span><strong id="home-pulse-question"></strong></div>
              <div class="home-pulse-votes" id="home-pulse-votes"></div><a id="home-pulse-link" href="predict.html">투표 참여 ›</a>
            </section>
          </div>
          <aside class="stack home-sidebar">
            <section class="card home-hero" id="home-hero" style="display:none" aria-label="오늘의 서사"></section>
            <section class="home-myteam" id="home-myteam" style="display:none" aria-label="내 응원팀"></section>
            <section class="card"><div class="card-head"><h2 class="card-title">LCK 순위</h2></div><div id="standings-body"></div></section>
            <section class="card home-schedule-card">
              <div class="card-head"><h2 class="card-title">이후 경기 일정</h2><a class="card-more" href="matches.html">전체 일정 ›</a></div>
              <div id="home-schedule-body"></div>
            </section>
          </aside>
        </div>
      </div>
    </main>`;

  HOME_MODULES.lck = {
    async mount(root) {
      // ⚠ 월즈 스킨을 폐기하면서 이 두 줄이 남아 있었다. 없는 요소에 값을 넣으려다
      //   오류가 나면서 **홈이 "불러오는 중"에서 멈췄다** (2026-08-18 실제 사고).
      //   파일을 지울 때는 그 파일을 **쓰는 쪽**도 같이 봐야 한다.
      document.body.classList.add("home-redesign");
      document.title = "The Nexus — LCK 팬 커뮤니티 | 경기 일정·승부예측·팬심지수";
      root.innerHTML = template;
      renderHeader("홈", null);
      renderFooter();
    },
    draw() {
      renderFanPickBar(() => this.draw());
      renderHomeMatchBar();
      renderHomeFeature();
      renderHomeMyTeam();
      renderHotPosts();
      renderHomeUpcomingSchedule();
      renderHomePulse();
      renderHomeNews();
      setupSidebarStandings();
      renderHomeDataTrust();
    },
  };
})();
