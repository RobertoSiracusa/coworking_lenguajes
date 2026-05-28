package com.coworking.reservations.service;

import com.coworking.reservations.model.Reserva;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpClientErrorException;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@Service
public class BillingClient {

    @Value("${billing.service.url}")
    private String billingUrl;

    private final RestTemplate restTemplate;

    public BillingClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    // Generar factura para una reserva completada. Snake_case (formato billing).
    public boolean generarFactura(Reserva r, String jwt) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("reserva_id",     r.getId());
            body.put("usuario_id",     r.getUsuarioId());
            body.put("espacio_id",     r.getEspacioId());
            body.put("nombre_espacio", r.getNombreEspacio());
            body.put("fecha_inicio",   r.getFechaInicio().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            body.put("fecha_fin",      r.getFechaFin().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            body.put("precio_hora",    r.getPrecioHora() != null ? r.getPrecioHora() : 0);

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + jwt);
            headers.set("Content-Type", "application/json");
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

            restTemplate.exchange(billingUrl + "/facturas", HttpMethod.POST, entity, Map.class);
            return true;
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.CONFLICT) {
                return true;
            }
            System.err.println("Error generando factura: " + e.getMessage());
            return false;
        } catch (Exception e) {
            System.err.println("Error generando factura: " + e.getMessage());
            return false;
        }
    }
}
