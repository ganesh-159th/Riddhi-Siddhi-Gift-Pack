import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Navbar from "./Navbar.jsx";
import Hero from "./Hero.jsx";
import Products from "./Products.jsx";
import Gallery from "./Gallery.jsx";
import Process from "./Process.jsx";
import Careers from "./Careers.jsx";
import Contact from "./Contact.jsx";
import TrustLegal from "./TrustLegal.jsx";
import Faq from "./Faq.jsx";
import Footer from "./Footer.jsx";
import WhatsAppFloat from "./WhatsAppFloat.jsx";
import CookieConsent from "./CookieConsent.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { fetchProducts } from "../lib/products.js";
import { initAnalytics, trackScrollDepth, trackWhatsAppLinks } from "../lib/analytics.js";

const ProductModal = lazy(() => import("./ProductModal.jsx"));

const PRODUCTS_STATE = { LOADING: "loading", READY: "ready", ERROR: "error" };

export default function SiteApp() {
  const { t } = useTranslation();
  const [products, setProducts] = useState([]);
  const [productsState, setProductsState] = useState(PRODUCTS_STATE.LOADING);
  const [modalProduct, setModalProduct] = useState(null);
  const [modalStartIdx, setModalStartIdx] = useState(0);

  const loadProducts = useCallback(() => {
    setProductsState(PRODUCTS_STATE.LOADING);
    fetchProducts()
      .then((data) => {
        setProducts(data);
        setProductsState(PRODUCTS_STATE.READY);
      })
      .catch(() => {
        setProducts([]);
        setProductsState(PRODUCTS_STATE.ERROR);
      });
  }, []);

  useEffect(() => {
    initAnalytics();
    const stopScrollTracking = trackScrollDepth();
    const stopWaTracking = trackWhatsAppLinks();
    return () => {
      stopScrollTracking();
      stopWaTracking();
    };
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return (
    <>
      {/* Background ambience */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-40 h-[520px] w-[520px] rounded-full bg-gold-500/10 blur-[140px]"></div>
        <div className="absolute -right-40 top-1/3 h-[560px] w-[560px] rounded-full bg-wine-500/20 blur-[160px]"></div>
        <div className="absolute bottom-0 left-1/4 h-[480px] w-[480px] rounded-full bg-navy-700/50 blur-[140px]"></div>
      </div>

      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy-950 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold-400 focus:ring-offset-2 focus:ring-offset-navy-950">
        {t("site.skipToContent")}
      </a>

      <Navbar />

      <main id="main">
        <Hero />
        <ErrorBoundary title={t("nav.products")}>
          <Products
            state={productsState}
            products={products}
            onRetry={loadProducts}
            onSelect={(p) => {
              setModalStartIdx(0);
              setModalProduct(p);
            }}
          />
        </ErrorBoundary>
        <ErrorBoundary title={t("nav.gallery")}>
          <Gallery
            products={products}
            onSelect={(p, imgIdx) => {
              setModalStartIdx(imgIdx);
              setModalProduct(p);
            }}
          />
        </ErrorBoundary>
        <ErrorBoundary title={t("nav.process")}>
          <Process />
        </ErrorBoundary>
        <ErrorBoundary title={t("nav.careers")}>
          <Careers />
        </ErrorBoundary>
        <ErrorBoundary title={t("nav.contact")}>
          <Contact products={products} />
        </ErrorBoundary>
        <ErrorBoundary title={t("trust.sectionLabel")}>
          <TrustLegal />
        </ErrorBoundary>
        <ErrorBoundary title={t("faq.sectionLabel")}>
          <Faq />
        </ErrorBoundary>
      </main>

      <Footer />
      <WhatsAppFloat />
      <CookieConsent />

      {modalProduct && (
        <ErrorBoundary title={t("modal.detailsTitle")}>
          <Suspense fallback={null}>
            <ProductModal
              product={modalProduct}
              startImage={modalStartIdx}
              onClose={() => setModalProduct(null)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
