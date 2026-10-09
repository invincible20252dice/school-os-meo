import { googleFailureDetail } from "./google-diagnostics";
import type { Snapshot } from "./challenge";

export type GuideImage = { src: string; alt: string; kind: "GOOD" | "NG" };
export type ActionGuide = {
  id: string; title: string; purpose: string; steps: string[]; checks: string[];
  avoid?: string[]; images?: GuideImage[]; example?: { before: string; after: string };
  sample?: string; details: string; path: string; cta: string;
  generation?: "description" | "post" | "improvement"; relatedPhotos?: string[];
};
const photoSpecs = [
  ["exterior", "外観", "初めて来る方が建物と入口を見つけられるようにします。", ["明るい時間帯に建物正面から撮る", "入口と看板の位置を画面内に収める", "車や物で入口が隠れていないか確認する"]],
  ["entrance", "入口", "どこから入ればよいかを伝えます。", ["ドアを中心に撮る", "階段や通路も分かる距離をとる", "暗い場合は時間帯を変える"]],
  ["classroom", "教室", "広さと清潔感、学ぶ場所の様子を伝えます。", ["机と椅子を整理してから撮る", "部屋全体が分かる位置に立つ", "極端な広角加工を避ける"]],
  ["lesson", "授業", "先生と生徒の関わり方を伝えます。", ["撮影・掲載の許諾を確認する", "先生と生徒、教室の様子が分かる位置で撮る", "氏名・成績表・画面が写っていないか確認する"]],
  ["self-study", "自習", "机・照明・集中して学べる場所を伝えます。", ["机と照明、通路が分かる構図にする", "学習中なら許諾を確認し背後から撮る", "ノートの氏名や個人情報を写さない"]],
  ["teacher", "講師", "実際に指導する先生の雰囲気を伝えます。", ["本人の掲載許諾を確認する", "明るい教室内で自然な表情を撮る", "過度なポーズや加工を避ける"]],
  ["consultation", "面談", "落ち着いて相談できる場所を伝えます。", ["机と椅子の配置が分かるように撮る", "面談資料や個人情報を片付ける", "室内を明るくして撮る"]],
  ["parking", "駐車場・駐輪場", "来校時に停める場所と入口の関係を伝えます。", ["利用できる区画と入口を一緒に撮る", "他車のナンバーを写さない", "専用スペースがない場合は対象外として理由を記録する"]],
] as const;
export const photoGuides: ActionGuide[] = photoSpecs.map(([id, title, purpose, steps]) => ({
  id: `photo-${id}`, title: `${title}の写真を撮る`, purpose, steps: [...steps], checks: ["対象が明るく、見切れていない", "個人情報や無断掲載になる人物が写っていない", "実際の教室・設備を撮影している"],
  avoid: ["暗い・傾きが大きい・重要な部分が隠れている写真", "AIのお手本を実際の教室写真として掲載すること"],
  images: [{ src: `/examples/meo/photos/${id}.webp`, alt: `${title}写真の撮影お手本（AI生成）`, kind: "GOOD" }, ...id === "exterior" ? [{ src: "/examples/meo/photos/exterior-ng.webp", alt: "暗く入口が隠れた外観写真の避けたい例（AI生成）", kind: "NG" as const }] : []],
  details: "管理権限のあるGoogleアカウントで対象店舗を開き、写真の追加操作を行います。公開先の店舗と実際の写真を確認してください。追加後はGoogle側の掲載状態を確認し、この画面の写真カテゴリへ戻って記録を保存します。",
  path: "/dashboard/settings/google", cta: "Google店舗設定を開く",
}));
const requestGuide: ActionGuide = {
  id: "request-reviews", title: "率直な感想をお願いする", purpose: "実際に利用している方の声を教室改善につなげます。",
  steps: ["実際に利用した保護者・生徒へ中立的に依頼する", "アンケート設定で対象のURLを確認する", "実際に送った人数を記録して保存する"],
  checks: ["評価の高低で依頼先を選別していない", "コピーだけで送信済みにしていない"],
  sample: "いつも教室をご利用いただきありがとうございます。今後の教室改善のため、実際に通っていただいているご感想をお聞かせいただけると嬉しいです。よろしければ、以下のアンケートから率直なお声をお寄せください。",
  details: "アンケート設定から対象アンケートのURLを取得し、依頼文と一緒に送ってください。回答やGoogleへの投稿は任意です。特典や高評価を条件に依頼しないでください。",
  path: "/dashboard/surveys", cta: "口コミ依頼・アンケートを開く",
};
const descriptionGuide: ActionGuide = {
  id: "description", title: "教室紹介文を具体的にする", purpose: "対象学年と実際の指導内容が伝わる紹介にします。",
  steps: ["対象学年・指導内容・利用条件を確認する", "登録内容と確認済みの事実から下書きを作る", "内容を編集・確認してGoogle上の紹介文へ反映する"],
  checks: ["実在するサービスだけを記載している", "料金・成果・利用条件を推測していない"],
  example: { before: "地域密着型の学習塾です。", after: "［教室名］では［対象学年］を対象に［実際の指導内容］を提供しています。［確認済みの利用条件］に合わせて学習をサポートします。" },
  details: "角括弧内は記入項目です。例文を実際のサービスと混同せず、自校舎の確認済み情報に置き換えてください。AI下書きは自動公開されません。",
  path: "/dashboard/settings/google", cta: "Google店舗設定を開く", generation: "description",
};
const replyGuide: ActionGuide = {
  id: "pending-replies", title: "Google口コミ原文を確認して返信する", purpose: "届いた声に沿って、感謝や改善姿勢を伝えます。",
  steps: ["口コミ一覧でGoogle口コミ原文を読む", "AI返信案を確認し、原文にない学校名・学年・成果等を削る", "必要に応じて編集し、内容を確認してGoogleへ返信する"],
  checks: ["Google原文とAI返信案を混同していない", "投稿者の属性や成果を推測していない", "Googleへの投稿結果を確認した"],
  details: "アンケートの回答や生成文章はGoogle口コミ原文の代わりにはしません。Google APIの制限や失敗は投稿完了ではありません。返信画面で結果を確認してください。",
  path: "/dashboard/reviews", cta: "Google口コミ原文・AI返信案を開く",
};
const postGuide: ActionGuide = {
  id: "publish-post", title: "教室の取り組みをGoogleで伝える", purpose: "保存済みの検索語句や教室の事実から、知りたい情報に応える投稿を作ります。",
  steps: ["根拠のあるテーマを1つ選ぶ", "実際の取り組みと利用条件を確認して下書きを作る", "文章を確認し、実際に撮影した写真を選んで公開する", "Google側の公開を確認し、URLまたは投稿名・日時を保存する"],
  checks: ["検索語句は市場全体の検索数と混同していない", "投稿にないサービスや実績を付け足していない", "下書きだけで公開完了としていない"],
  example: { before: "教室の特徴を紹介します。", after: "［テーマ］についてご紹介します。［実際の取り組み・対象・利用条件］。詳しくは［確認済みの問い合わせ先］へご相談ください。" },
  details: "検索語句がない場合は、確認できた教室情報からテーマを手動で選びます。検索需要が高いとは表示しません。Googleへの公開操作は既存画面で内容確認のうえ行ってください。",
  path: "/dashboard/instagram", cta: "既存の投稿・Google同期を開く", generation: "post", relatedPhotos: ["photo-self-study", "photo-lesson", "photo-consultation"],
};
const improvementGuide: ActionGuide = {
  ...descriptionGuide, id: "competitor-improvement", title: "実測した競合との差を1つ改善する",
  purpose: "保存済みの比較から、実行できる改善を1つ選びます。", generation: "improvement",
  steps: ["順位・競合画面で計測日時と比較対象を確認する", "文章・写真など実行可能な改善を1つ選ぶ", "実行前後を記録し、参照した計測IDと一緒に保存する"],
  example: { before: "自習室あり", after: "自習室の利用時間は［確認した時間］です。利用対象は［確認した対象］で、［確認済みの利用方法］でご利用いただけます。" },
  path: "/dashboard/rankings", cta: "保存済みの競合計測を開く", relatedPhotos: photoGuides.map(g => g.id),
};
const contactGuide: ActionGuide = {
  id: "contact", title: "保護者の立場で問い合わせまで進む", purpose: "興味を持った方が迷わず連絡できる状態にします。",
  steps: ["スマートフォンで自校舎名をGoogle検索する", "対象のGoogleプロフィールからWebサイトを開く", "無料体験・お問い合わせ・学習相談を探す", "電話・LINE・フォームの導線を実際にテストする"],
  checks: ["問い合わせ先をすぐ見つけられる", "リンク切れがない", "対象のLINE・フォームが開く", "電話番号が正しい"],
  details: "テスト送信にはテストであることを明記し、問い合わせ成果から除外します。クリック数を問い合わせ件数とみなさず、流入元を確認できない場合は不明として記録してください。",
  path: "/dashboard/settings/google", cta: "問い合わせ先の設定を開く",
};
const simple: Record<string, [string, string]> = {
  name: ["正式な教室名", "公式Webサイト・看板とGoogle上の教室名を照合します。"],
  phone: ["電話番号", "実際に使える問い合わせ先か、桁や発信先を確認します。"],
  address: ["住所・地図ピン", "建物・階数・入口と地図上の位置を照合します。"],
  category: ["カテゴリ", "実際の事業内容とGoogle上のカテゴリを照合します。"],
  hours: ["営業時間", "通常営業時間と休業日・特別営業時間を照合します。"],
};
const simpleGuides: ActionGuide[] = Object.entries(simple).map(([id, [title, purpose]]) => ({
  id, title: `${title}を確認する`, purpose, steps: [purpose, "誤りがあればGoogle上で修正する", "確認した状態を記録して保存する"], checks: ["公式情報と一致している"],
  details: "変更が反映されるまで確認待ちの場合は、完了とは分けて記録してください。", path: "/dashboard/settings/google", cta: "Google店舗設定を開く",
}));
export const guideRegistry: ReadonlyMap<string, ActionGuide> = new Map([...photoGuides, ...simpleGuides, requestGuide, descriptionGuide, replyGuide, postGuide, improvementGuide, contactGuide,
  { id: "google-connect", title: "対象校舎をGoogleに連携する", purpose: "管理する店舗と校舎を正しく紐付けます。", steps: ["Google連携設定を開く", "対象店舗の管理権限があるアカウントで認証する", "校舎名・住所を照合して対象店舗を選ぶ"], checks: ["別校舎の店舗を選んでいない"], details: "認証情報やトークンをコピーして共有しないでください。連携が失敗した場合は設定画面の案内を確認します。", path: "/dashboard/settings/google", cta: "Google連携設定を開く" },
].map(g => [g.id, g]));

// Resolve existing keys without changing saved action types or progress documents.
export function guideForAction(key: string): ActionGuide | undefined {
  const photo = /^check-2-photo([0-7])$/.exec(key);
  if (photo) return photoGuides[Number(photo[1])];
  if (key.startsWith("check-1-")) return guideRegistry.get(key.slice(8) === "website" ? "contact" : key.slice(8));
  if (/^check-7-(contact|links|test)$/.test(key)) return contactGuide;
  if (key.startsWith("publish-")) return postGuide;
  if (/^day-[3-7]$/.test(key)) return [requestGuide, replyGuide, postGuide, improvementGuide, contactGuide][Number(key.slice(4)) - 3];
  return guideRegistry.get(key);
}
export function guideForField(day: number, key: string) {
  return guideForAction(`check-${day}-${key}`) ?? guideForAction(`day-${day}`);
}
export function postTopics(snapshot: Snapshot) {
  const usable = snapshot.demandStatus === undefined || snapshot.demandStatus === "AVAILABLE";
  const topics = (usable ? snapshot.demand ?? [] : []).filter(row => row.impressions > 0).toSorted((a, b) => b.impressions - a.impressions)
    .filter((row, i, rows) => rows.findIndex(other => other.query === row.query) === i).slice(0, 3);
  return { topics, message: topics.length ? "Googleで自校舎が見つかった検索語句（保存済み）。市場全体の検索数ではありません。"
    : snapshot.demandStatus === "DISCONNECTED" ? "検索語句を取得するGoogle店舗が未連携です。Google連携設定を確認してください。"
    : snapshot.demandStatus === "EMPTY" ? "Googleから正常に取得しましたが、対象月の検索語句は0件です。"
    : snapshot.demandStatus === "API_ERROR" ? snapshot.demandHttpStatus === 429 && (snapshot.demandStage === undefined || snapshot.demandStage === "GOOGLE_API") ? "Google検索語句APIの利用枠制限（429）で取得できません。管理者がGoogle CloudのAPI利用承認・割り当てを確認してください。" : `Google検索語句API：${googleFailureDetail({ stage: snapshot.demandStage, httpStatus: snapshot.demandHttpStatus })}確認済みの教室情報から手動でテーマを入力できます。`
    : snapshot.demandStatus === "DB_ERROR" ? `検索語句のDB取得・保存に失敗しました。${googleFailureDetail({ stage: snapshot.demandStage, httpStatus: snapshot.demandHttpStatus })}管理者にお問い合わせください。`
    : snapshot.demandStatus === "AVAILABLE" ? "Googleの検索語句は取得済みですが、正確な表示数を確認できる語句がありません。少数データの閾値を表示数として扱いません。"
    : snapshot.demand === null ? "検索語句を取得できませんでした。確認済みの教室情報からテーマを入力できます。"
      : "検索語句の保存データがありません。確認済みの教室情報からテーマを入力できます。" };
}
