package com.coworking.reservations.service;

import com.coworking.reservations.algorithm.CacheLRU;
import com.coworking.reservations.dto.EspacioDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import java.util.Map;

@Service
public class EspacioClient {

    @Value("${space.service.url}")
    private String spaceUrl;

    private final RestTemplate restTemplate;
    private final CacheLRU<Long, EspacioDto> cacheEspacios = new CacheLRU<>(100);

    public EspacioClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    // Obtener espacio por id desde space service
    public EspacioDto obtenerEspacio(Long id, String jwt) {
        EspacioDto cacheado = cacheEspacios.get(id);
        if (cacheado != null) return cacheado;

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + jwt);
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<EspacioDto> resp = restTemplate.exchange(
                    spaceUrl + "/espacios/" + id, HttpMethod.GET, entity, EspacioDto.class);
            EspacioDto espacio = resp.getBody();
            if (espacio != null) cacheEspacios.put(id, espacio);
            return espacio;
        } catch (Exception e) {
            System.err.println("Error consultando space service: " + e.getMessage());
            return null;
        }
    }

    public Map<String, Object> estadisticas() {
        return cacheEspacios.estadisticas();
    }
}
