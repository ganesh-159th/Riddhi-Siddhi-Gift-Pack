import { useCallback, useEffect, useState } from "react";
import Navbar from "./Navbar.jsx";
import Hero from "./Hero.jsx";
import Products from "./Products.jsx";
import Gallery from "./Gallery.jsx";
import ProductModal from "./ProductModal.jsx";
import Process from "./Process.jsx";
import Careers from "./Careers.jsx";
import Contact from "./Contact.jsx";
import TrustLegal from "./TrustLegal.jsx";
import Faq from "./Faq.jsx";
import Footer from "./Footer.jsx";
import WhatsAppFloat from "./WhatsAppFloat.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { fetchProducts } from "../lib/products.js";

const PRODUCTS_STATE = { LOADING: "loading", READY: "ready", ERROR: "error" };

export default function SiteApp() {
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

      <Navbar />

      <main>
        <Hero />
        <ErrorBoundary title="Products">
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
        <ErrorBoundary title="Gallery">
          <Gallery
            products={products}
            onSelect={(p, imgIdx) => {
              setModalStartIdx(imgIdx);
              setModalProduct(p);
            }}
          />
        </ErrorBoundary>
        <ErrorBoundary title="Process">
          <Process />
        </ErrorBoundary>
        <ErrorBoundary title="Careers">
          <Careers />
        </ErrorBoundary>
        <ErrorBoundary title="Contact">
          <Contact products={products} />
        </ErrorBoundary>
        <ErrorBoundary title="Trust & Legal">
          <TrustLegal />
        </ErrorBoundary>
        <ErrorBoundary title="FAQ">
          <Faq />
        </ErrorBoundary>
      </main>

      <Footer />
      <WhatsAppFloat />

      {modalProduct && (
        <ErrorBoundary title="Product details">
          <ProductModal
            product={modalProduct}
            startImage={modalStartIdx}
            onClose={() => setModalProduct(null)}
          />
        </ErrorBoundary>
      )}
    </>
  );
}
