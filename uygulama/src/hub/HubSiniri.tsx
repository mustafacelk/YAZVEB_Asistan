import { Component, type ReactNode } from "react";

/**
 * HUB'da beklenmedik bir hata (parça inemedi, sürücü hatası...) uygulamanın
 * tamamını düşürmesin: HUB kapanır, klasik görünüm çalışmaya devam eder.
 */
export default class HubSiniri extends Component<{ children: ReactNode; onHata: () => void }, { hata: boolean }> {
  state = { hata: false };

  static getDerivedStateFromError() {
    return { hata: true };
  }

  componentDidCatch(hata: unknown) {
    console.error("YAZVEB HUB kapandı:", hata);
    this.props.onHata();
  }

  render() {
    return this.state.hata ? null : this.props.children;
  }
}
