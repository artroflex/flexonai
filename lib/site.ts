import { SITE_URL } from './deployment'

export const PUBLIC_ORIGIN = SITE_URL || 'https://artroblog.vercel.app'
export const SITE_DESCRIPTION = '트렌드 수집부터 핵심 요약·출처를 담은 GEO 글쓰기, 네이버 발행 연결까지. artroBLOG는 AI 검색이 이해하기 쉬운 콘텐츠를 만드는 블로그 작업 공간입니다.'

export const SERVICE_FAQS = [
  { question: 'artroBLOG는 어떤 서비스인가요?', answer: 'artroBLOG는 트렌드와 뉴스 글감을 수집하고, AI로 블로그 초안을 작성하며, 글과 이미지를 관리하는 콘텐츠 작업 공간입니다. 연예뉴스 자동화는 최근 24시간의 기사 제목·요약을 바탕으로 출처를 표시한 초안을 만듭니다.' },
  { question: 'GEO 글쓰기는 무엇인가요?', answer: 'GEO(Generative Engine Optimization)는 AI 검색이 콘텐츠의 의미와 근거를 이해하기 쉽도록 내용을 구성하는 접근입니다. artroBLOG는 핵심 답변을 앞에 두고, 명확한 소제목과 원문 출처로 맥락을 전달하도록 글 생성을 안내합니다. AI 답변에 인용되거나 검색에 노출되는 것은 보장하지 않습니다.' },
  { question: 'AI API 키가 필요한가요?', answer: 'AI 글을 생성하려면 본인의 API 키가 필요합니다. 연예뉴스 자동화의 기본 공급자는 OpenAI이며 Gemini와 Claude도 선택할 수 있습니다. API 사용료는 선택한 공급자의 본인 계정에 청구됩니다. ChatGPT 구독과 OpenAI API 결제는 별개입니다.' },
  { question: '네이버 자동발행은 어떻게 연결하나요?', answer: 'PC 크롬에 artroBLOG 연결 도구를 설치하고 본인의 네이버 계정에 로그인합니다. 글을 임시저장해 제목·본문·이미지·카테고리를 확인한 뒤 자동 발행을 켤 수 있습니다. 네이버 전송에는 PC와 크롬이 켜져 있어야 하며, 로그인 만료 시 다시 로그인해야 합니다.' },
  { question: '연예뉴스는 언제 생성하나요?', answer: '정기 생성을 켜면 한국 시간 오전 9시·오후 1시·오후 6시에 각 1건씩, 하루 최대 3건을 생성합니다. 실행 시각은 스케줄러에 따라 달라질 수 있습니다. 새로운 출처가 부족하거나 확인된 사실이 충분하지 않으면 건너뜁니다.' },
  { question: '다른 사람도 사용할 수 있나요?', answer: '각자 이메일로 회원가입하고 이메일 인증 후 로그인해 이용할 수 있습니다. 본인의 API 키와 네이버 블로그를 연결해야 하며 글·키·자동화 설정은 계정별로 관리합니다. 생성한 글과 이미지는 30일 보관하므로 장기 게시할 이미지는 본인 블로그에 직접 업로드해 주세요.' },
]
