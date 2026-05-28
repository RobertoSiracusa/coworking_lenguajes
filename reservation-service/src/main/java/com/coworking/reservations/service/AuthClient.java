package com.coworking.reservations.service;

import com.coworking.reservations.algorithm.CacheLRU;
import com.coworking.reservations.dto.UsuarioDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import java.util.Map;
import java.util.List;
import java.util.HashMap;

@Service
public class AuthClient {

    @Value("${auth.service.url}")
    private String authUrl;

    private final RestTemplate restTemplate;
    private final CacheLRU<Long, UsuarioDto> cacheUsuarios = new CacheLRU<>(100);

    public AuthClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    // Obtener usuario por id. Llama GET /usuarios con JWT admin y cachea.
    public UsuarioDto obtenerUsuario(Long id, String jwt) {
        UsuarioDto cacheado = cacheUsuarios.get(id);
        if (cacheado != null) return cacheado;

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + jwt);
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<UsuarioDto[]> resp = restTemplate.exchange(
                    authUrl + "/usuarios", HttpMethod.GET, entity, UsuarioDto[].class);
            UsuarioDto[] usuarios = resp.getBody();
            if (usuarios == null) return null;
            for (UsuarioDto u : usuarios) cacheUsuarios.put(u.getId(), u);
            return cacheUsuarios.get(id);
        } catch (Exception e) {
            System.err.println("Error consultando auth service: " + e.getMessage());
            return null;
        }
    }

    public boolean validarUsuarioExiste(Long id, String jwt) {
        return obtenerUsuario(id, jwt) != null;
    }

    public Map<String, Object> estadisticas() {
        return cacheUsuarios.estadisticas();
    }
}
