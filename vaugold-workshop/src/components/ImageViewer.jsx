// src/components/ImageViewer.jsx
import React from 'react';

/**
 * Компонент полноэкранного просмотра изображений (Модальное окно).
 * Отвечает за удобный просмотр эскизов изделий и ремонтов без ухода с текущей страницы.
 * * @param {string} src - Ссылка на изображение (base64 или URL из базы)
 * @param {function} onClose - Функция закрытия модалки (сбрасывает стейт в ноль)
 */
export const ImageViewer = ({ src, onClose }) => {
  if (!src) return null; // Если картинки нет — компонент вообще ничего не рендерит

  return (
    <div 
      // Фиксированный задний фон на весь экран с размытием и чернотой
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] flex items-center justify-center">
        {/* Кнопка закрытия (крестик) в верхнем правом углу */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white bg-white/10 hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center transition-colors text-xl font-bold"
          title="Закрыть"
        >
          &times;
        </button>
        
        {/* Само изображение с защитой от растягивания */}
        <img
          src={src}
          alt="Просмотр"
          className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl border border-white/10"
          onClick={(e) => e.stopPropagation()} // Останавливаем клик, чтобы модалка не закрывалась при нажатии на саму картинку
        />
      </div>
    </div>
  );
};

export default ImageViewer;